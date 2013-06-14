#!/bin/env node
/**
 * Module dependencies.
 */

var express = require('express'),
    async = require('async'),
    http = require('http'),
    fs = require('fs'),
    path = require('path'),
    config = require('./config.js'),
    request = require('request'),
    xml2js = require('xml2js'),
    mongoose = require('mongoose'),
    Grid = require('gridfs-stream'),
    SendGrid = require('sendgrid').SendGrid;


var NewEdenFaces = function() {
  var self = this;


  /*  ================================================================  */
  /*  Helper functions.                                                 */
  /*  ================================================================  */

  /**
   *  Set up server IP address and port # using env variables/defaults.
   */
  self.setupVariables = function() {
      //  Set the environment variables we need.
      self.ipaddress = process.env.OPENSHIFT_NODEJS_IP ||
                       process.env.OPENSHIFT_INTERNAL_IP;
      self.port      = process.env.OPENSHIFT_NODEJS_PORT   ||
                       process.env.OPENSHIFT_INTERNAL_PORT || 8080;

      if (typeof self.ipaddress === "undefined") {
          //  Log errors on OpenShift but continue w/ 127.0.0.1 - this
          //  allows us to run/test the app locally.
          console.warn('No OPENSHIFT_*_IP var, using 127.0.0.1');
          self.ipaddress = "127.0.0.1";
      };
  };

  /**
   *  terminator === the termination handler
   *  Terminate server on receipt of the specified signal.
   *  @param {string} sig  Signal to terminate on.
   */
  self.terminator = function(sig){
      if (typeof sig === "string") {
         console.log('%s: Received %s - terminating sample app ...',
                     Date(Date.now()), sig);
         process.exit(1);
      }
      console.log('%s: Node server stopped.', Date(Date.now()) );
  };

  /**
   *  Setup termination handlers (for exit and a list of signals).
   */
  self.setupTerminationHandlers = function(){
      //  Process on exit and signals.
      process.on('exit', function() { self.terminator(); });

      // Removed 'SIGPIPE' from the list - bugz 852598.
      ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
       'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
      ].forEach(function(element, index, array) {
          process.on(element, function() { self.terminator(element); });
      });
  };

  /**
  *  Initialize the server (express) and create the routes and register
  *  the handlers.
  */
  self.initializeServer = function() {
    app = express();

    /**
     * App Initialization
     */
    var parser = new xml2js.Parser();
    mongoose.connect(config.mongoose);
    var gfs = Grid(mongoose.connection.db, mongoose.mongo);
    /**
     * DB Schema and Model
     */
    var Character = mongoose.model('Character', {
      characterId: { type: String, unique: true },
      name: String,
      image32: String,
      image64: String,
      image128: String,
      image256: String,
      image512: String,
      race: String,
      gender: String,
      bloodline: String,
      rating: { type: Number, default: 1400 },
      wins: { type: Number, default: 0 },
      losses: { type: Number, default: 0 },
      userRating: { type: Number, default: 0 },
      userRatingVotes: { type: Number, default: 0 },
      reportCount: { type: Number, default: 0 }
    });


    // all environments
    app.set('port', process.env.PORT || 3000);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.favicon(__dirname + '/public/favicon.ico')); 
    app.use(express.favicon());
    app.use(express.logger('dev'));
    app.use(express.compress());
    app.use(express.staticCache());
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
    app.use(express.static(path.join(__dirname, 'public')));

    // development only
    if ('development' == app.get('env')) {
      app.use(express.errorHandler());
    }

    // report endpoint
    // I could add an if-statement to api/characters/:id instead that will get
    // checked everytime is model saved on backbone, but that will cause performance issues
    // That endpoint is also used on the home page where most people spend their time,
    // so checking an if-statement thousands of times is redundant
    app.post('/api/report', function(req, res) {
      Character.findById(req.body._id, function(err, character) {
        
        character.reportCount += 1;
        
        if (character.reportCount >= 5) {
          // remove character from DateB
          Character.remove({ _id: req.body._id }, function (err) {
            if (err) return res.send(500, err);
            console.log('Character has been removed');
            res.send(200, {'message': 'Character has been removed'});
          });
        } else {
          character.save(function(err) {
            res.send(200, {'message': 'Character has been reported++'});
          });
        }
      });
    });


    app.post('/api/grid', function(req, res) {
      var url = 'https://image.eveonline.com/Character/' + req.body.characterId + '_' + req.body.size + '.jpg';
      var filename = url.replace(/^.*[\\\/]/, '');
      var filepath = path.join(__dirname, filename);

      var gfs = Grid(mongoose.connection.db, mongoose.mongo);
      var writestream = gfs.createWriteStream({ filename: filename });

      var imageStream = request(url).pipe(fs.createWriteStream(filepath));

      imageStream.on('close', function() {
        fs.createReadStream(filepath).pipe(writestream);
        res.send('KOSHER');
      });

    });


    app.get('/api/grid/:filename', function(req, res) {
      var filename = req.params.filename;
      var gfs = Grid(mongoose.connection.db, mongoose.mongo);
      var readstream = gfs.createReadStream({
        filename: filename
      });
      readstream.pipe(res);
      readstream.on('error', function(err) {
        return res.send(500, 'Error while retriving a file from database');
      });
    });

    //  Add handlers for the app (from the routes).
    app.put('/api/characters/:id', function(req, res) {
      Character.findById(req.body._id, function(err, character) {
        if (err) return res.send(500, 'Error in accessing the database');
        
        if (!red.body.wins || !req.body.losses || !req.body.rating || !req.body.userRating || !req.body.userRatingVotes) {
          return res.send(500, 'One of the character attributes is NULL');
        }
        
        character.wins = req.body.wins;
        character.losses = req.body.losses;
        character.rating = req.body.rating;
        character.userRating = req.body.userRating;
        character.userRatingVotes = req.body.userRatingVotes;
        character.save(function(err) {
          res.send(200);
        });
      });
    });

    app.get('/api/characters', function(req, res) {
      Character.find(function(err, characters) {
        res.send(characters);
      });
    });


    app.post('/api/characters', function(req, res) {

      var charNameInput = req.body.name;
      // strip space characters
      charNameInput = charNameInput.replace(/\s/g, '%20');
      var characterIdUrl = 'https://api.eveonline.com/eve/CharacterID.xml.aspx?names=' + charNameInput;

      async.waterfall([
        function(callback){
          // get character id from character name
          request.get({ url: characterIdUrl }, function(err, r, body) {
            if (err) return res.send(500, 'Error in retrieving character id');

            parser.parseString(body, function(err, response) {
              if (response.eveapi.error) return res.send(404, 'Character name not found');

              var characterId = response.eveapi.result[0].rowset[0].row[0].$.characterID;
              var image32 = 'https://image.eveonline.com/Character/' + characterId + '_32.jpg';
              var image64 = 'https://image.eveonline.com/Character/' + characterId + '_64.jpg';
              var image128 = 'https://image.eveonline.com/Character/' + characterId + '_128.jpg';
              var image256 = 'https://image.eveonline.com/Character/' + characterId + '_256.jpg';
              var image512 = 'https://image.eveonline.com/Character/' + characterId + '_512.jpg';
              var characterInfoUrl = 'https://api.eveonline.com/eve/CharacterInfo.xml.aspx?characterID=' + characterId;

              // check if character already exists
              Character.findOne({'characterId': characterId }, function(err, character) {
                if (character) return res.send(409, { characterId: character.characterId });
                callback(null, characterId, characterInfoUrl, image32, image64, image128, image256, image512);
              });
            });
          });
        },
        function(characterId, characterInfoUrl, image32, image64, image128, image256, image512, waterfallCallback) {

          async.parallel({
            one: function(callback){
              var filename32 = image32.replace(/^.*[\\\/]/, '');
              var filepath32 = path.join(__dirname, filename32);
              var writestream32 = gfs.createWriteStream({ filename: filename32 });
              var imageStream32 = request(image32).pipe(fs.createWriteStream(filepath32));

              imageStream32.on('close', function(err) {
                if (err) return res.send(500, 'File error has occured');
                var gridstream = fs.createReadStream(filepath32).pipe(writestream32);
                gridstream.on('close', function(err) {
                  fs.unlink(filepath32);
                  callback(null, filename32);
                });
              });
            },
            two: function(callback) {
              var filename64 = image64.replace(/^.*[\\\/]/, '');
              var filepath64 = path.join(__dirname, filename64);
              var writestream64 = gfs.createWriteStream({ filename: filename64 });
              var imageStream64 = request(image64).pipe(fs.createWriteStream(filepath64));

              imageStream64.on('close', function(err) {
                if (err) return res.send(500, 'File error has occured');
                var gridstream = fs.createReadStream(filepath64).pipe(writestream64);
                gridstream.on('close', function(err) {
                  fs.unlink(filepath64);
                  callback(null, filename64);
                });
              });
            },
            three: function(callback){
              var filename128 = image128.replace(/^.*[\\\/]/, '');
              var filepath128 = path.join(__dirname, filename128);
              var writestream128 = gfs.createWriteStream({ filename: filename128 });
              var imageStream128 = request(image128).pipe(fs.createWriteStream(filepath128));

              imageStream128.on('close', function(err) {
                if (err) return res.send(500, 'File error has occured');
                var gridstream = fs.createReadStream(filepath128).pipe(writestream128);
                gridstream.on('close', function(err) {
                  fs.unlink(filepath128);
                  callback(null, filename128);
                });
              });
            },
            four: function(callback){
              var filename256 = image256.replace(/^.*[\\\/]/, '');
              var filepath256 = path.join(__dirname, filename256);
              var writestream256 = gfs.createWriteStream({ filename: filename256 });
              var imageStream256 = request(image256).pipe(fs.createWriteStream(filepath256));

              imageStream256.on('close', function(err) {
                if (err) return res.send(500, 'File error has occured');
                var gridstream = fs.createReadStream(filepath256).pipe(writestream256);
                gridstream.on('close', function(err) {
                  fs.unlink(filepath256);
                  callback(null, filename256);
                });
              });
            },
            five: function(callback){
              var filename512 = image512.replace(/^.*[\\\/]/, '');
              var filepath512 = path.join(__dirname, filename512);
              var writestream512 = gfs.createWriteStream({ filename: filename512 });
              var imageStream512 = request(image512).pipe(fs.createWriteStream(filepath512));

              imageStream512.on('close', function(err) {
                if (err) return res.send(500, 'File error has occured');
                var gridstream = fs.createReadStream(filepath512).pipe(writestream512);
                gridstream.on('close', function(err) {
                  fs.unlink(filepath512);
                  callback(null, filename512);
                });
              });
            }
          },
          function(err, results) {
              // results is now equals to: {one: 1, two: 2}
              var filename32 = results.one;
              var filename64 = results.two;
              var filename128 = results.three;
              var filename256 = results.four;
              var filename512 = results.five;
              console.log(results);
              waterfallCallback(null, characterId, characterInfoUrl, filename32, filename64, filename128, filename256, filename512);
          });
        },
        function(characterId, characterInfoUrl, filename32, filename64, filename128, filename256, filename512, callback){
          // get character info: race, bloodline, etc.
          console.log('parallel is over');
          request.get({ url: characterInfoUrl }, function(err, r, body) {
            if (err) return res.send(500, 'Error in retrieving character information page');

            parser.parseString(body, function(err, response) {
              if (err) return res.send(500, 'Error parsing XML');
              if (response.eveapi.error) return res.send(404);
          
              var characterName = response.eveapi.result[0].characterName[0];
              var race = response.eveapi.result[0].race[0];
              var bloodline = response.eveapi.result[0].bloodline[0];
              
              var character = new Character({
                characterId: characterId,
                name: characterName,
                race: race,
                bloodline: bloodline,
                image32: '/api/grid/' + filename32,
                image64: '/api/grid/' + filename64,
                image128: '/api/grid/' + filename128,
                image256: '/api/grid/' + filename256,
                image512: '/api/grid/' + filename512
              });

              console.log(character);

              character.save(function(err) {
                if (err) return res.send(500, 'Error while saving new character to database');
                res.send(character);
              });
              
            });
          });

          callback(null, 'done');
        }
      ]);
    });

    app.get('/api/characters/:id', function(req, res) {
      Character.findOne({ characterId: req.params.id }, function(err, character) {
        res.send(character);
      });
    });


    app.post('/api/feedback', function(req, res) {
      var sendgrid = new SendGrid(config.sendgrid_user, config.sendgrid_key);
      var characterName = req.body.characterName;
      var message = req.body.message;
      var uiRating = req.body.uiRating;
      var text = 'From: ' + characterName + '.' + 'User Interface: ' +
                  uiRating + '.' + 'Message: ' + message + '.';
      
      sendgrid.send({
        to: 'sakhat@gmail.com',
        from: 'aura@neweden.com',
        subject: 'Site Feedback',
        text: text
      }, function(success, message) {
        if (!success) {
          console.log(message);
        }
        res.send('Email has been sent successfully');
      });
    });


    // PushState redirects
    // 
    app.get('/add', function(req, res) {
      res.redirect('/#add');
    });

    app.get('/feedback', function(req, res) {
      res.redirect('/#feedback');
    });

    app.get('/top100', function(req, res) {
      res.redirect('/#top100');
    });

    app.get('/characters/:id', function(req, res) {
      res.redirect('/#characters/' + req.params.id);
    });

  };

  /**
   *  Initializes the sample application.
   */
  self.initialize = function() {
    self.setupVariables();
    

    //self.setupTerminationHandlers();

    // Create the express server and routes.
    self.initializeServer();
  };


  /**
   *  Start the server (starts up the sample application).
   */
  self.start = function() {
    //  Start the app on the specific interface (and port).
    app.listen(self.port, self.ipaddress, function() {
        console.log('%s: Node server started on %s:%d ...',
                    Date(Date.now() ), self.ipaddress, self.port);
    });
  };  
};

var zapp = new NewEdenFaces();
zapp.initialize();
zapp.start();

