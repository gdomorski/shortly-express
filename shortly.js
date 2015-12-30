var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var passport = require('passport');
var GithubStrategy = require('passport-github').Strategy;
var cookieParser = require('cookie-parser');
var methodOverride = require('method-override');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var auth = require('./routes/auth');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
// app.use(methodOverride());
app.use(cookieParser());
app.use(session({
  secret: 'mysecret',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GithubStrategy({
  clientID: 'f8925fa5ed776dcc4f69',
  clientSecret: 'c097eb1febf5723e99e781abf78465deb5e23cc9',
  callbackURL: 'http://127.0.0.1:4568/auth/callback'
}, function(accessToken, refreshToken, profile, done){
  done(null, {
    accessToken: accessToken,
    profile: profile
  });
}));


passport.serializeUser(function(user, done) {
  // for the time being tou can serialize the user 
  // object {accessToken: accessToken, profile: profile }
  // In the real app you might be storing on the id like user.profile.id 
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  // If you are storing the whole user on session we can just pass to the done method, 
  // But if you are storing the user id you need to query your db and get the user 
  //object and pass to done() 
  done(null, user);
});


app.get('/auth', passport.authenticate('github'));
app.get('/auth/error', auth.error);
app.get('/auth/callback',
  passport.authenticate('github', {failureRedirect: '/auth/error'}),
  auth.callback
);



app.get('/', util.checkLoggedIn,
function(req, res) {
  res.render('index');
});


app.get('/login',
function(req, res) {
  req.session.user = undefined;
  res.render('login');
});

app.get('/signup',
function(req, res) {
  res.render('signup');
});

app.get('/create', util.checkLoggedIn,
function(req, res) {
    res.render('index');
});

app.get('/links', util.checkLoggedIn,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.post('/links', util.checkLoggedIn,
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        Links.create({
          url: uri,
          title: title,
          base_url: req.headers.origin
        })
        .then(function(newLink) {
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/
app.post('/signup', function(req, res){
  var username = req.body.username;
  var password = req.body.password;

  db.knex('users').where({ username : username}).then(function(found) {    
    if(found.length > 0){
       res.redirect('/')
     }else{
      new User({ username : username , password: password}).save().then(function(){
        res.redirect('/');
      }).catch(function(err){
        console.log(err);
      });
     }
    
  });
});

app.post('/login', function(req, res){
  var username = req.body.username;
  var password = req.body.password;
  db.knex('users').where({ username : username , password : password}).then(function(found) {   
    if(found.length > 0){
       req.session.user = username;
       res.redirect('/')
     }else{
        res.redirect('/login');
     }
  });
});





/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits')+1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
