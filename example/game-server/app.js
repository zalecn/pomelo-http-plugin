'use strict';
var pomelo = require('pomelo');
var httpPlugin = require('../../');
var path = require('path');
var logger = require('pomelo-logger').getLogger('pomelo');

/**
 * Init app for client.
 */
var app = pomelo.createApp();
app.set('name', 'example');


// app configuration
app.configure('development', 'gamehttp', function() {
	app.use(httpPlugin, {http: {statics: "app/servers/gamehttp/static", logger:logger}});
    var log = require('./app/filters/log');
	httpPlugin.filter(log());
});
// start app
app.start();

process.on('uncaughtException', function(err) {
	console.error(' Caught exception: ' + err.stack);
});