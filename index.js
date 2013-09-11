#!/usr/local/bin/node

require('longjohn');

var outQueue = require('./out_queue');
var workers  = require('./workers');
var server   = require('./server');
var inQueue  = require('./in_queue');

var port = 9182;

console.log('starting runner...');
server.listen(port);
