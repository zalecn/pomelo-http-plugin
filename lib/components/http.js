'use strict';

var express = require('express');
var http = require('http');
var https = require('https');
var path = require('path');
var fs = require('fs');
var assert = require('assert');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var errorHandler = require('errorhandler');

module.exports = function(app, opts) {
  return new Http(app, opts);
};

var DEFAULT_HOST = '127.0.0.1';
var DEFAULT_PORT = 3001;

var createExpressLogger = function(logger) {
  return morgan('short', {
    stream: {
      write: function(str) {
        logger.debug(str);
      }
    }
  })
};

var defaultLogger = function() {
  return {
    debug: console.log,
    info: console.log,
    warn: console.warn,
    error: console.error
  }
};

var staticHandler = function (expressInst, val, logger) {
    var expressStatic = function (val) {
        return express.static(val);
    };
    if(typeof val == 'string') {
        expressInst.use(expressStatic(val))
    } else if(val instanceof Array) {
        val.forEach(function(val) {
            staticHandler(expressInst, val);
        });
    } else if(val instanceof Object) {
        if(val.real) {
            if(val.virtual) {
                expressInst.use(val.virtual, expressStatic(val.real));
            } else {
                expressInst.use(expressStatic(val.real));
            }
        } else {
            logger.error('Http parse static opts failed: %j', val);
        }
    }
};

//opts
//opts.host
//opts.port
//opts.keyFile
//opts.certFile
//opts.useSSL
//opts.logger
//opts.statics  [{virtual: '/static', real:'public')}]  or ['public1', 'public2'] or 'public'
var Http = function(app, opts) {
  var svrCfg = app.getServerFromConfig(app.getServerId());
  opts = opts || {};
  this.app = app;
  this.http = express();
  this.host = svrCfg.httpHost || opts.host || DEFAULT_HOST;
  this.port = svrCfg.httpPort || opts.port || DEFAULT_PORT;

  if (svrCfg.clusterCount > 1) {
    var serverId = app.getServerId();
    var params = serverId.split('-');
    var idx = parseInt(params[params.length - 1], 10);
    if (/\d+\+\+/.test(this.port)) {

      this.port = parseInt(this.port.substr(0, this.port.length - 2));
    } else {
      assert.ok(false, 'http cluster expect http port format like "3000++"');
    }

    this.port = this.port + idx;
  }

  this.useSSL = !!opts.useSSL;
  this.sslOpts = {};
  if (this.useSSL) {
    this.sslOpts.key = fs.readFileSync(path.join(app.getBase(), opts.keyFile));
    this.sslOpts.cert = fs.readFileSync(path.join(app.getBase(), opts.certFile));
  }

  this.logger = opts.logger || defaultLogger();

  this.http.set('port', this.port);
  this.http.set('host', this.host);
  this.http.use(createExpressLogger(this.logger));
  this.http.use(bodyParser.json());
  this.http.use(bodyParser.urlencoded({ extended: true }));
  this.http.use(methodOverride());


  if(opts.statics) {
    staticHandler(this.http, opts.statics, this.logger);
  }

  var self = this;
  this.app.configure(function() {
    self.http.use(errorHandler());
  });

  this.beforeFilters = require('../../index').beforeFilters;
  this.afterFilters = require('../../index').afterFilters;
  this.server = null;
};

Http.prototype.loadRoutes = function() {
  this.http.get('/', function(req, res) {
    res.send('ok!');
  });

  var routesPath = path.join(this.app.getBase(), 'app/servers', this.app.getServerType(), 'route');
  // self.logger.info(routesPath);
  assert.ok(fs.existsSync(routesPath), 'Cannot find route path: ' + routesPath);

  var self = this;
  fs.readdirSync(routesPath).forEach(function(file) {
    if (/.js$/.test(file)) {
      var routePath = path.join(routesPath, file);
      // self.logger.info(routePath);
      require(routePath)(self.app, self.http, self);
    }
  });
};

Http.prototype.start = function(cb) {
  var self = this;

  this.beforeFilters.forEach(function(elem) {
    self.http.use(elem);
  });

  this.loadRoutes();

  this.afterFilters.forEach(function(elem) {
    self.http.use(elem);
  });

  if (this.useSSL) {
    this.server = https.createServer(this.sslOpts, this.http).listen(this.port, this.host, function() {
      self.logger.info('"' + self.app.getServerId() + '"', 'Http start', 'url: https://' + self.host + ':' + self.port);
      //self.logger.info('Http start success');
      process.nextTick(cb);
    });
  } else {
    this.server = http.createServer(this.http).listen(this.port, this.host, function() {
      self.logger.info('"' + self.app.getServerId() + '"', 'Http start', 'url: http://' + self.host + ':' + self.port);
      //self.logger.info('Http start success');
      process.nextTick(cb);
    });
  }
};

Http.prototype.afterStart = function(cb) {
  //this.logger.info('Http afterStart');
  process.nextTick(cb);
};

Http.prototype.stop = function(force, cb) {
  //var self = this;
  this.server.close(function() {
    //self.logger.info('Http stop');
    cb();
  });
};