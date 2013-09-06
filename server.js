var net       = require('net');
var rpc       = require('rpc-stream');
var rpcServer = require('./rpc_server');

var server = module.exports = net.createServer(handleConnection);

server.on('listening', onListening);

function onListening() {
  console.log('Runner server listening');
}

function handleConnection(conn) {
  var server = rpc(rpcServer);

  server.pipe(conn).pipe(server);
}