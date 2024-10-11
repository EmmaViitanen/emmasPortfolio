const adminName = "Emma";
// const adminPassword = "emma123";
const adminPassword = "$2b$12$QM/utCih8TuPDbFdTaOhjO9q1u7N.sAHbohyuDN4tHgQHc1AAAigK";

//!----------
//! PACKAGES
//!----------
const express = require("express");
// Load the handlebars package for express
const { engine } = require("express-handlebars");
const sqlite3 = require("sqlite3");
const session = require("express-session");
const connectSqlite3 = require("connect-sqlite3");
const fs = require("fs");
const bodyParser = require("body-parser");
// const sanitizeHTML = require("sanitize-html");
//-- BCRYPT --
const bcrypt = require("bcrypt");
const { throwDeprecation } = require("process");
const { ifError } = require("assert");
const { CLIENT_RENEG_LIMIT } = require("tls");
const { error } = require("console");
const saltRounds = 12;

//!------
//! PORT
//!------
const port = 8080;

//!-------------
//! APPLICATION
//!-------------
const app = express();

//!----------
//! DATABASE
//!----------
const dbFile = "my-project-data.sqlite3.db";
db = new sqlite3.Database(dbFile);

//!----------
//! SESSIONS
//!----------
const SQLiteStore = connectSqlite3(session);

app.use(
  session({
    store: new SQLiteStore({ db: "session-db.db" }),
    saveUninitialized: false,
    resave: false,
    secret: "This123String!#€Is)/&Secret123",
    // cookie: {
    //   sameSite: "strict",
    //   httpOnly: true,
    //   secure: true,
    // },
  })
);
app.use(function (req, res, next) {
  console.log("Session passed to response locals...");

  res.locals.session = req.session;

  next();
});

//!-------------
//! MIDDLEWARES
//!-------------
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

//!-------------
//! VIEW ENGINE
//!-------------
app.engine(
  "handlebars",
  engine({
    helpers: {
      eq(a, b) {
        return a == b;
      },
    },
  })
); // initialize the engine to be handlebars
app.set("view engine", "handlebars"); // set handlebars as the view engine
app.set("views", "./views"); // define the views directory to be ./views

//!-----------
//!ROUTES
//!-----------

//# Default route
app.get("/", function (req, res) {
  // res.render("home.handlebars");
  const model = {
    isLoggedIn: req.session.isLoggedIn,
    name: req.session.name,
    isAdmin: req.session.isAdmin,
  };
  console.log("---> Home model: " + JSON.stringify(model));
  res.render("home.handlebars", model);
});

//# About route
app.get("/about", function (req, res) {
  db.all("SELECT * FROM skills", (error, listOfSkills) => {
    if (error) {
      console.log("ERROR: ", error);
    } else {
      model = { skills: listOfSkills };
      res.render("about.handlebars", model);
    }
  });
});

//# Contact route
app.get("/contact", function (req, res) {
  res.render("contact.handlebars");
});

//# Projects routes
app.get("/projects", function (req, res) {
  const page = parseInt(req.query.page) || 1;
  const limit = 3;
  const offset = (page - 1) * limit;
  const nextPage = page + 1;
  const prevPage = page - 1;

  //   https://chatgpt.com/share/67052627-4df8-800b-a011-9176bb22a89f 8/10-2024
  db.all(
    `SELECT projects.*, GROUP_CONCAT(skills.sname) AS skills
FROM projects
INNER JOIN project_skills ON projects.pid = project_skills.pid
INNER JOIN skills ON project_skills.sid = skills.sid
GROUP BY projects.pid
LIMIT ? OFFSET ?;
`,
    [limit, offset],
    (error, listOfProjects) => {
      if (error) {
        console.log("ERROR: ", error);
        return res.status(500).send("Internal server error");
      }

      const hasNextPage = listOfProjects.length === limit;
      model = {
        projects: listOfProjects,
        page,
        nextPage: hasNextPage ? nextPage : null,
        prevPage: prevPage > 0 ? prevPage : null,
      };
      res.render("projects.handlebars", model);
    }
  );
});
app.get("/project/:projid", function (req, res) {
  console.log("Project route parameter projectid: " + JSON.stringify(req.params.projid));
  db.get(`SELECT * FROM projects WHERE pid=?`, [req.params.projid], (error, theProject) => {
    if (error) {
      console.log("ERROR: ", error);
    } else {
      const model = { project: theProject };
      res.render("project.handlebars", model);
    }
  });
});
app.get("/project/delete/:projid", function (req, res) {
  if (req.session.isAdmin) {
    console.log("Project route parameter projid: " + JSON.stringify(req.params.projid));
    db.run("DELETE FROM projects WHERE pid=?", [req.params.projid], (error, theProject) => {
      if (error) {
        console.log("ERROR: ", error);
      } else {
        console.log("The project " + req.params.projid + " has been deleted");
        res.redirect("/projects");
      }
    });
  } else {
    res.redirect("/login");
  }
});
app.get("/project/add/new", function (req, res) {
  res.render("project-new.handlebars");
});
app.post("/project/add/new", function (req, res) {
  const title = req.body.projtitle;
  const year = req.body.projyear;
  const type = req.body.projtype;
  const description = req.body.projdesc;
  const url = req.body.projurl;
  const selectSkill = req.body.projskill;

  db.run(
    "INSERT INTO projects (ptitle, pyear, ptype, pdesc, purl) VALUES (?, ?, ?, ?, ?)",
    [title, year, type, description, url],
    function (error) {
      if (error) {
        console.log("ERROR inserting project: ", error);
        return res.redirect("/projects");
      }

      db.get(
        "SELECT pid FROM projects WHERE ptitle=? AND pyear=? AND ptype=? AND pdesc=? AND purl=?",
        [title, year, type, description, url],
        function (error, project) {
          if (error) {
            console.log("ERROR retrieving project ID: ", error);
            return res.redirect("/projects");
          }

          if (project) {
            const projectID = project.pid;

            // https://chatgpt.com/share/6709136b-cb38-800b-9548-7eb938fdd50e
            db.get("SELECT sid FROM skills WHERE sname=?", [selectSkill], function (error, skill) {
              if (error) {
                console.log("ERROR retrieving skill ID: ", error);
                return res.redirect("/projects");
              }

              if (skill) {
                const skillID = skill.sid;

                db.run("INSERT INTO project_skills (pid, sid) VALUES (?, ?)", [projectID, skillID], function (error) {
                  if (error) {
                    console.log("ERROR inserting into project_skills: ", error);
                    return res.redirect("/projects");
                  }

                  console.log("Successfully added skills into project_skills");
                  res.redirect("/projects");
                });
              } else {
                console.log("Skill not found");
                res.redirect("/projects");
              }
            });
          } else {
            console.log("Project not found after insertion");
            res.redirect("/projects");
          }
        }
      );
    }
  );
});

app.get("/project/modify/:projid", function (req, res) {
  const id = req.params.projid;
  db.get("SELECT * FROM projects WHERE pid=?", [id], (error, theProject) => {
    if (error) {
      console.log("ERROR: ", error);
      res.redirect("/projects");
    } else {
      model = { project: theProject };
      res.render("project-new.handlebars", model);
    }
  });
});
// app.post("/project/modify/:projid", function (req, res) {
//   const id = req.params.projid;
//   const title = req.body.projtitle;
//   const year = req.body.projyear;
//   const type = req.body.projtype;
//   const description = req.body.projdesc;

//   const url = req.body.projurl;
//   db.run(
//     `UPDATE projects SET ptitle=?, pyear=?, ptype=?, pdesc=?, purl=? WHERE pid=?`,
//     [title, year, type, description, url, id],
//     (error) => {
//       if (error) {
//         console.log("ERROR: ", error);
//         res.redirect("/projects");
//       } else {
//         res.redirect("/projects");
//       }
//     }
//   );
// });
app.post("/project/modify/:projid", function (req, res) {
  const id = req.params.projid;
  const title = req.body.projtitle;
  const year = req.body.projyear;
  const type = req.body.projtype;
  const description = req.body.projdesc;
  const url = req.body.projurl;
  const selectedSkill = req.body.projskill; // Get the selected skill from the form

  db.run(
    `UPDATE projects SET ptitle=?, pyear=?, ptype=?, pdesc=?, purl=? WHERE pid=?`,
    [title, year, type, description, url, id],
    function (error) {
      if (error) {
        console.log("ERROR: ", error);
        return res.redirect("/projects");
      }

      //   https://chatgpt.com/share/6709136b-cb38-800b-9548-7eb938fdd50e 11/10-2024
      // Step 2: Remove existing skills associated with the project
      db.run("DELETE FROM project_skills WHERE pid=?", [id], function (error) {
        if (error) {
          console.log("ERROR: ", error);
          return res.redirect("/projects");
        }

        // Step 3: Insert the new skill into the project_skills table
        if (selectedSkill) {
          // Find the skill ID (sid) for the selected skill
          db.get("SELECT sid FROM skills WHERE sname = ?", [selectedSkill], function (error, skill) {
            if (error) {
              console.log("ERROR: ", error);
              return res.redirect("/projects");
            }

            if (skill) {
              // Insert into the project_skills table
              db.run("INSERT INTO project_skills (pid, sid) VALUES (?, ?)", [id, skill.sid], function (error) {
                if (error) {
                  console.log("ERROR: ", error);
                } else {
                  console.log("Project and skill successfully associated!");
                }
                res.redirect("/projects");
              });
            } else {
              console.log("No matching skill found for the selected skill");
              res.redirect("/projects");
            }
          });
        } else {
          // If no skill is selected, just redirect
          res.redirect("/projects");
        }
      });
    }
  );
});

//# Login, Logout, add-user
app.get("/login", (req, res) => res.render("login.handlebars"));
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    model = { error: "Username and password are required.", message: "" };
    return res.status(400).render("login.handlebars", model);
  }

  db.get("SELECT * FROM users WHERE uname = ?", [username], (err, user) => {
    if (err) {
      console.log("Database error: ", err);
      const model = {
        error: "Internal server error. Please try again.",
        message: "",
      };
      return res.status(500).render("login.handlebars", model);
    }

    if (user) {
      console.log("The username is the admin one!");

      bcrypt.compare(password, user.upassword, (err, result) => {
        if (err) {
          const model = {
            error: "Error while comparing passwords: " + err,
            message: "",
          };
          res.render("login.handlebars", model);
        }
        if (result && adminName === username) {
          console.log("The password is the admin one!");

          req.session.isAdmin = true;
          req.session.isLoggedIn = true;
          req.session.name = username;

          console.log("session information: " + JSON.stringify(req.session));

          res.redirect("/profile");
        } else if (result) {
          console.log("The password is the admin one!");

          req.session.isAdmin = false;
          req.session.isLoggedIn = true;
          req.session.name = username;

          console.log("session information: " + JSON.stringify(req.session));

          res.redirect("/profile");
        } else {
          const model = {
            error: "Sorry, the password is not correct...",
            message: "",
          };
          res.status(400).render("login.handlebars", model);
        }
      });
    } else {
      const model = {
        error: `Sorry, the username "${username}" is not correct...`,
        message: "",
      };
      res.status(400).render("login.handlebars", model);
    }
  });
});
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});
app.get("/add-user", (req, res) => {
  res.render("add-user.handlebars");
});
app.post("/add-user", (req, res) => {
  const { uemail, uname, upassword } = req.body;

  bcrypt.hash(upassword, saltRounds, function (err, hash) {
    if (err) {
      console.log("---> Error encrypting the password: "), err;
    } else {
      console.log("---> Hashed password (GENERATE only ONCE): ", hash);

      db.run("INSERT INTO users(umail, uname, upassword) VALUES (?, ?, ?)", [uemail, uname, hash], (err) => {
        if (err) {
          res.status(500).send({ error: "Server error" });
        } else {
          res.redirect("/login");
          console.log("Your are registered");
        }
      });
    }
  });
});

//# Profile route
app.get("/profile", (req, res) => {
  res.render("profile.handlebars");
});

//# Users route
app.get("/users", (req, res) => {
  db.all("SELECT * FROM users", (error, listOfUsers) => {
    if (error) {
      console.log("ERROR: ", error);
    } else {
      model = { users: listOfUsers };
      res.render("users.handlebars", model);
    }
  });
});
app.get("/user/:uid", function (req, res) {
  console.log("User route parameter uid: " + JSON.stringify(req.params.uid));
  // select in the table with the given id
  db.get("SELECT * FROM users WHERE uid=?", [req.params.uid], (error, theUser) => {
    if (error) {
      console.log("ERROR: ", error);
    } else {
      const model = { user: theUser };
      res.render("user.handlebars", model);
    }
  });
});
app.get("/user/delete/:uid", function (req, res) {
  console.log("User route parameter uid: " + JSON.stringify(req.params.uid));
  db.run("DELETE FROM users WHERE uid=?", [req.params.uid], (error) => {
    if (error) {
      console.log("ERROR: ", error);
    } else {
      console.log("The user " + req.params.uid + " has been deleted");
      res.redirect("/users");
    }
  });
});
app.get("/user/modify/:uid", function (req, res) {
  const id = req.params.uid;
  db.get("SELECT * FROM users WHERE uid=?", [id], (error, theUser) => {
    if (error) {
      console.log("ERROR: ", error);
      res.redirect("/users");
    } else {
      model = { user: theUser };
      res.render("modify_user.handlebars", model);
    }
  });
});
app.post("/user/modify/:uid", function (req, res) {
  const id = req.params.uid;
  const email = req.body.usermail;
  const name = req.body.username;
  db.run(`UPDATE users SET umail=?, uname=? WHERE uid=?`, [email, name, id], (error) => {
    if (error) {
      console.log("ERROR: ", error);
      res.redirect("/users");
    } else {
      res.redirect("/users");
    }
  });
});

//? Style.css route
app.get("/style.css", function (req, res) {
  res.sendFile("/style.css", { root: "public" });
});

//!---------------
//! 404 NOT FOUND
//!---------------
app.use(function (req, res) {
  res.status(404).render("404.handlebars");
});

//!-----------
//! 500 ERROR
//!-----------
app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.status(500).render("500");
});

//!--------
//! LISTEN
//!--------
app.listen(port, function () {
  //   initTableSkills(db);
  initTableProjects(db);
  //   initTableUsers(db);
  //   initTableComments(db);
  //   deleteTable(db);
  initTableJoin(db);
  console.log("Server up and running, listening on port" + `${port}` + "...   :)");
});

// function deleteTable(mydb) {
//   db.run("DROP TABLE IF EXISTS projects", console.log("---> Table was deleted"));
//   db.run("DROP TABLE IF EXISTS project_skills", console.log("---> Table was deleted"));
// }

//!-----------
//! FUNCTIONS
//!-----------
function initTableProjects(mydb) {
  const projects = [
    {
      pid: 1,
      ptitle: "NMD Patch",
      ptype: "Illustration",
      pyear: "2024",
      pdesc:
        "The official kickoff patch 2024 for NMD created in Illustrator. This pactch was sold during the kickoff by the fadders of NMD.",
      purl: "/img/nmd_2024_patch.png",
    },
    {
      pid: 2,
      ptitle: "NMD Hoodie Print",
      ptype: "Illustration",
      pyear: "2024",
      pdesc:
        "This design was actually a collaboration with Erik Sandqvist. He did the design for the NMD Kickoff 2024 flag and I did the design for the NMD Kickoff 2024 patch. Combining the two and then outlining the illustrations in white created the design then printed on each NMD fadders hoodie.",
      purl: "/img/nmd_hoodie.png",
    },
    {
      pid: 3,
      ptitle: "Mulan",
      ptype: "Illustration",
      pyear: "2021",
      pdesc:
        "I created this project during my last year in highschool in the grapghic design course. The assignment was to illustrate a digital poster in Adobe Illustrator by taking inspiration from realistic pictures. I chose the poster for the, then, new live action of Mulan because I wanted a challange. All of the classes posters where hung up in the schools hallway as a form of a gallery wall.",
      purl: "/img/IMG_1019.jpeg",
    },
    {
      pid: 4,
      ptitle: "Pandemic eyes",
      ptype: "Illustration",
      pyear: "2021",
      pdesc:
        "This painting was created in art class during my first year of highscool. This was during the begining of the pandemic and the vision for the assignment was to create something meaningful without words. This painting symbolises the lonelyness of isolation during the pandemic.",
      purl: "/img/IMG_0899.png",
    },
    {
      pid: 5,
      ptitle: "Zonne Magazine",
      ptype: "Illustration",
      pyear: "2024",
      pdesc:
        "This magazine was a group project for the course Visual Communication last semester of university. I created this with Nellie Olsson Wennberg, Erik Sandqvist and Anton Kinnander. The assignemnt was to create a magazine with some requirenments. We chose to do a travel magazine highlighting hidden gems but also popular locations in Europe. This project was created using mostly InDesign but also Photoshop.",
      purl: "/img/zonne-cover.jpeg",
    },
    {
      pid: 6,
      ptitle: "Marvin",
      ptype: "Programming",
      pyear: "2022",
      pdesc:
        "Marvin or Pingu, is a chatbot that can do what you ask it to do by choosing an option from 1-12 or the inventory. This project was created in Python code language when I studied webbprogramming at Blekinge Tekniska högskola, BTH. ",
      purl: "/img/marvin.png",
    },
    {
      pid: 7,
      ptitle: "ENE Postery",
      ptype: "Programming",
      pyear: "2023",
      pdesc:
        "This was a group project by me and Nellie Olsson Wennberg for the course Web and User Interface Design. The assignment was to create a hardcoded interactive website using CSS, HTML and JavaScript. We began by sketching a lo-fi prototype to then apply it to the hi-fi prototype in figma. Then we wrote the code using Visual Studio Code. The website's purpose is to sell posters online. You can filter your preferences, read about each artist and so on.",
      purl: "/img/ene.png",
    },
    {
      pid: 8,
      ptitle: "Fast And Fantastic",
      ptype: "Programming",
      pyear: "2024",
      pdesc:
        "This group project was done by me and Erik Sandqvist in the course Foundations of Programming. Fast and Fantastic is a car racing game programmed using javaSctript in the form of canvas.js and basic HTML and CSS to display it online. ",
      purl: "/img/fastandfantastic.png",
    },
    {
      pid: 9,
      ptitle: "Götasol",
      ptype: "Photography",
      pyear: "2021",
      pdesc:
        "This picture was taken when I went on a boat trip with my family, traviling along the Göta Kanal. This was a beautiful sunset peeking through behind the trees that I just needed to snap a picture of.",
      purl: "/img/sunset.jpeg",
    },
    {
      pid: 10,
      ptitle: "Söder",
      ptype: "Photography",
      pyear: "2024",
      pdesc:
        "This image was shot in the middle of summer in söder, Stockholm. Me and my friend was walking around and I thought it looked aestetic and therefore snaped a shot of it.",
      purl: "/img/sthlm.jpeg",
    },
  ];
  db.serialize(() => {
    db.run(
      "CREATE TABLE IF NOT EXISTS projects (pid INTEGER PRIMARY KEY AUTOINCREMENT, ptitle TEXT NOT NULL, pyear INTEGER NOT NULL, ptype TEXT NOT NULL, pdesc TEXT NOT NULL, purl TEXT NOT NULL, sid INTEGER, FOREIGN KEY (sid) REFERENCES skills(sid))",
      (error) => {
        if (error) {
          console.log("ERROR: ", error);
        } else {
          console.log("---> Table projects created");

          projects.forEach((oneProject) => {
            db.run(
              "INSERT INTO projects (pid, ptitle, pyear, ptype, pdesc, purl, sid) VALUES (?, ?, ?, ?, ?, ?, ?)",
              [
                oneProject.pid,
                oneProject.ptitle,
                oneProject.pyear,
                oneProject.ptype,
                oneProject.pdesc,
                oneProject.purl,
                oneProject.sid,
              ],
              (error) => {
                if (error) {
                  console.log("ERROR: ", error);
                } else {
                  console.log("Line added into the projects table");
                }
              }
            );
          });
        }
      }
    );
  });
}

function initTableSkills(mydb) {
  const skills = [
    {
      sid: "1",
      sname: "HTML",
      stype: "Programming Language",
      sdesc: "Used to build websites",
    },
    {
      sid: "2",
      sname: "CSS",
      stype: "Programming Language",
      sdesc: "Used to style websites",
    },
    {
      sid: "3",
      sname: "JavaScript",
      stype: "Programming Language",
      sdesc: "Used to develope websites",
    },
    {
      sid: "4",
      sname: "Python",
      stype: "Programming Language",
      sdesc: "Used for building websites and software, automate tasks, and conduct data analysis",
    },
    {
      sid: "5",
      sname: "PHP",
      stype: "Programming Language",
      sdesc: "Used to script websites that are dynamic and interactive.",
    },
    {
      sid: "6",
      sname: "SQL and SQLite",
      stype: "Programming language",
      sdesc: "Database",
    },
    {
      sid: "7",
      sname: "Audacity",
      stype: "Music",
      sdesc: "Used to cut, mix and remix music",
    },
    {
      sid: "8",
      sname: "Photoshop",
      stype: "Adobe Program",
      sdesc: "Program for editing images",
    },
    {
      sid: "9",
      sname: "Illustrator",
      stype: "Adobe Program",
      sdesc: "Program for creating illustrations",
    },
    {
      sid: "10",
      sname: "InDesign",
      stype: "Adobe Program",
      sdesc: "Program for creating layouts",
    },
    {
      sid: "11",
      sname: "PremierPro",
      stype: "Adobe Program",
      sdesc: "Program for editing videos",
    },
    {
      sid: "12",
      sname: "Audition",
      stype: "Adobe Program",
      sdesc: "Program for mixing, edeting and creating audio content",
    },
    {
      sid: "13",
      sname: "AdobeXD",
      stype: "Adobe Program",
      sdesc: "Program for creating vectorizised prototypes for applications",
    },
    {
      sid: "14",
      sname: "Photography",
      stype: "Camera",
      sdesc: "Canon IXUS, Iphone, Fujifilm Intax poloroid camera",
    },
    {
      sid: "15",
      sname: "Painting",
      stype: "Visual art",
      sdesc: "Acrylic, akvarell, pencil",
    },
  ];
  db.serialize(() => {
    db.run(
      "CREATE TABLE IF NOT EXISTS skills (sid INTEGER PRIMARY KEY AUTOINCREMENT, sname TEXT NOT NULL, stype TEXT NOT NULL, sdesc TEXT NOT NULL, pid INTEGER, FOREIGN KEY (pid) REFERENCES projects(pid) )",
      (error) => {
        if (error) {
          console.log("ERROR: ", error);
        } else {
          console.log("---> Table skills created!");

          skills.forEach((oneSkill) => {
            db.run(
              "INSERT INTO skills (sid, sname, stype, sdesc, pid) VALUES (?, ?, ?, ?, ?)",
              [oneSkill.sid, oneSkill.sname, oneSkill.stype, oneSkill.sdesc, oneSkill.pid],
              (error) => {
                if (error) {
                  console.log("ERROR: ", error);
                } else {
                  console.log("Line added into the skills");
                }
              }
            );
          });
        }
      }
    );
  });
}

function initTableUsers(mydb) {
  db.serialize(() => {
    db.run(
      "CREATE TABLE IF NOT EXISTS users (uid INTEGER PRIMARY KEY, umail TEXT NOT NULL, uname TEXT NOT NULL, upassword TEXT NOT NULL)",
      (error) => {
        if (error) {
          console.log("ERROR: ", error);
        } else {
          console.log("---> Table projects created!");
        }
      }
    );
  });
}

function initTableComments(mydb) {
  const comments = [];
  db.serialize(() => {
    db.run(
      "CREATE TABLE IF NOT EXISTS comments (cid INTEGER PRIMARY KEY AUTOINCREMENT,cinput TEXT NOT NULL, uid INTEGER, pid INTEGER, FOREIGN KEY (uid) REFERENCES users(uid), FOREIGN KEY (pid) REFERENCES projects(pid))",
      (error) => {
        if (error) {
          console.log("ERROR: ", error);
        } else {
          console.log("---> Table comments created");

          comments.forEach((oneComment) => {
            db.run("INSERT INTO comments (cid, cinput) VALUES (?, ?)", [oneComment.cid, oneComment.cinput], (error) => {
              if (error) {
                console.log("ERROR: ", error);
              } else {
                console.log("Line added into comments");
              }
            });
          });
        }
      }
    );
  });
}

function initTableJoin(mydb) {
  const projskill = [
    {
      pid: 1,
      sid: 9,
    },
    {
      pid: 2,
      sid: 9,
    },
    {
      pid: 3,
      sid: 9,
    },
    {
      pid: 4,
      sid: 15,
    },
    {
      pid: 5,
      sid: 8,
    },
    {
      pid: 5,
      sid: 10,
    },
    {
      pid: 6,
      sid: 4,
    },
    {
      pid: 7,
      sid: 1,
    },
    {
      pid: 7,
      sid: 2,
    },
    {
      pid: 7,
      sid: 3,
    },
    {
      pid: 8,
      sid: 3,
    },
    {
      pid: 8,
      sid: 1,
    },
    {
      pid: 8,
      sid: 2,
    },
    {
      pid: 9,
      sid: 14,
    },
    {
      pid: 10,
      sid: 14,
    },
  ];
  db.serialize(() => {
    db.run(
      "CREATE TABLE IF NOT EXISTS project_skills (pid INTEGER, sid INTEGER, PRIMARY KEY (pid, sid), FOREIGN KEY (pid) REFERENCES projects(pid), FOREIGN KEY (sid) REFERENCES skills(sid))",
      (error) => {
        if (error) {
          console.log("ERROR: ", error);
        } else {
          console.log("---> Table projskill created");

          projskill.forEach((oneProjskill) => {
            db.run(
              "INSERT INTO project_skills (pid, sid) VALUES (?, ?)",
              [oneProjskill.pid, oneProjskill.sid],
              (error) => {
                if (error) {
                  console.log("ERROR: ", error);
                } else {
                  console.log("Line added into the projskills");
                }
              }
            );
          });
        }
      }
    );
  });
}
// if (password == adminPassword) {
//   console.log("The password is the admin one!");
//   const model = { error: "", message: "Welcome home Emma!" };
//   res.render("login.handlebars", model);
// } else {
//   const model = {
//     error: "Sorry, the password is not correct...",
//     message: "",
//   };
//   res.status(400).render("login.handlebars", model);
// }

// const model = { error: "", message: "Welcome home Emma!" };
// res.render("login.handlebars", model);

// ! DROP TABLE IF EXISTS
