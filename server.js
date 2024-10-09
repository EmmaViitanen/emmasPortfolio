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
app.get("/project/:projectid", function (req, res) {
  console.log("Project route parameter projectid: " + JSON.stringify(req.params.projectid));
  // select in the table with the given id
  db.get(`SELECT * FROM projects WHERE pid=?`, [req.params.projectid], (error, theProject) => {
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
  const url = req.body.projurl;
  db.run("INSERT INTO projects (ptitle, pyear, ptype, purl) VALUES (?, ?, ?, ?)", [title, year, type, url], (error) => {
    if (error) {
      console.log("ERROR: ", error);
      res.redirect("/projects");
    } else {
      console.log("Line added into the projects table");
      res.redirect("/projects");
    }
  });
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
app.post("/project/modify/:projid", function (req, res) {
  const id = req.params.projid;
  const title = req.body.projtitle;
  const year = req.body.projyear;
  const type = req.body.projtype;
  const url = req.body.projurl;
  db.run(
    `UPDATE projects SET ptitle=?, pyear=?, ptype=?, purl=? WHERE pid=?`,
    [title, year, type, url, id],
    (error) => {
      if (error) {
        console.log("ERROR: ", error);
        res.redirect("/projects");
      } else {
        res.redirect("/projects");
      }
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
          console.log("ÖHHHHHH");
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
app.get("/user/:userid", function (req, res) {
  console.log("User route parameter userid: " + JSON.stringify(req.params.uid));
  // select in the table with the given id
  db.get("SELECT * FROM users WHERE uid=?", [req.params.usertid], (error, theUser) => {
    if (error) {
      console.log("ERROR: ", error);
    } else {
      const model = { user: theUser };
      res.render("user.handlebars", model);
    }
  });
});
app.get("/user/delete/:userid", function (req, res) {
  console.log("User route parameter userid: " + JSON.stringify(req.params.userid));
  db.run("DELETE FROM users WHERE uid=?", [req.params.userid], (error) => {
    if (error) {
      console.log("ERROR: ", error);
    } else {
      console.log("The user " + req.params.userid + " has been deleted");
      res.redirect("/users");
    }
  });
});
app.get("/user/modify/:projid", function (req, res) {
  const id = req.params.userid;
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
app.post("/user/modify/:projid", function (req, res) {
  const id = req.params.userid;
  const email = req.body.useremail;
  const name = req.body.username;
  const password = req.body.userpassword;
  db.run(`UPDATE users SET umail=?, uname=?, upassword=?`, [email, name, password, id], (error) => {
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
  // initTableSkills(db);
  //   initTableProjects(db);
  //   initTableUsers(db);
  //   initTableComments(db);
  //   initTableJoin(db);
  console.log("Server up and running, listening on port" + `${port}` + "...   :)");
});

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
      purl: "/img/nmd_2024_patch.png",
    },
    {
      pid: 2,
      ptitle: "NMD Hoodie Print",
      ptype: "Illustration",
      pyear: "2024",
      purl: "/img/nmd_hoodie.png",
    },
    {
      pid: 3,
      ptitle: "Mulan",
      ptype: "Illustration",
      pyear: "2021",
      purl: "/img/IMG_1019.jpeg",
    },
    {
      pid: 4,
      ptitle: "Pandemic eyes",
      ptype: "Illustration",
      pyear: "2021",
      purl: "/img/IMG_0899.png",
    },
    {
      pid: 5,
      ptitle: "Zonne Magazine",
      ptype: "Illustration",
      pyear: "2024",
      purl: "/img/zonne-cover.jpeg",
    },
    {
      pid: 6,
      ptitle: "Marvin",
      ptype: "Programming",
      pyear: "2022",
      purl: "/img/marvin.png",
    },
    {
      pid: 7,
      ptitle: "ENE Postery",
      ptype: "Programming",
      pyear: "2023",
      purl: "/img/ene.png",
    },
    {
      pid: 8,
      ptitle: "Fast And Fantastic",
      ptype: "Programming",
      pyear: "2024",
      purl: "/img/fastandfantastic.png",
    },
    {
      pid: 9,
      ptitle: "Götasol",
      ptype: "Photography",
      pyear: "2021",
      purl: "/img/sunset.jpeg",
    },
    {
      pid: 10,
      ptitle: "Söder",
      ptype: "Photography",
      pyear: "2024",
      purl: "/img/sthlm.jpeg",
    },
  ];
  db.serialize(() => {
    db.run(
      "CREATE TABLE IF NOT EXISTS projects (pid INTEGER PRIMARY KEY AUTOINCREMENT, ptitle TEXT NOT NULL, pyear INTEGER NOT NULL, ptype TEXT NOT NULL, purl TEXT NOT NULL)",
      (error) => {
        if (error) {
          console.log("ERROR: ", error);
        } else {
          console.log("---> Table projects created");

          projects.forEach((oneProject) => {
            db.run(
              "INSERT INTO projects (pid, ptitle, pyear, ptype, purl) VALUES (?, ?, ?, ?, ?)",
              [oneProject.pid, oneProject.ptitle, oneProject.pyear, oneProject.ptype, oneProject.purl],
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
      sname: "Adobe programs",
      stype: "Design",
      sdesc: "Photoshop, Illustrator, InDesign, PremierPro, Audition, Adobe XD",
    },
    {
      sid: "2",
      sname: "HTML",
      stype: "Programming Language",
      sdesc: "Used to build websites",
    },
    {
      sid: "3",
      sname: "CSS",
      stype: "Programming Language",
      sdesc: "Used to style websites",
    },
    {
      sid: "4",
      sname: "JavaScript",
      stype: "Programming Language",
      sdesc: "Used to develope websites",
    },
    {
      sid: "5",
      sname: "Python",
      stype: "Programming Language",
      sdesc: "Used for building websites and software, automate tasks, and conduct data analysis",
    },
    {
      sid: "6",
      sname: "PHP",
      stype: "Programming Language",
      sdesc: "Used to script websites that are dynamic and interactive.",
    },
    {
      sid: "7",
      sname: "SQL and SQLite",
      stype: "Programming language",
      sdesc: "Database",
    },
    {
      sid: "8",
      sname: "Audacity",
      stype: "Music",
      sdesc: "Used to cut, mix and remix music",
    },
  ];
  db.serialize(() => {
    db.run(
      "CREATE TABLE IF NOT EXISTS skills (sid INTEGER PRIMARY KEY AUTOINCREMENT, sname TEXT NOT NULL, stype TEXT NOT NULL, sdesc TEXT NOT NULL)",
      (error) => {
        if (error) {
          console.log("ERROR: ", error);
        } else {
          console.log("---> Table skills created!");

          skills.forEach((oneSkill) => {
            db.run(
              "INSERT INTO skills (sid, sname, stype, sdesc) VALUES (?, ?, ?, ?)",
              [oneSkill.sid, oneSkill.sname, oneSkill.stype, oneSkill.sdesc],
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
  //   const users = [];
  db.serialize(() => {
    db.run(
      "CREATE TABLE IF NOT EXISTS users (uid INTEGER PRIMARY KEY AUTOINCREMENT, umail TEXT NOT NULL, uname TEXT NOT NULL, upassword TEXT NOT NULL)",
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
