var _exec = require('child_process').exec;

module.exports = copy;

function copy(source, zone, target, cb) {

  findParentAddress(function(err, parent) {
   if (err) return cb(err);
    cmd = 'scp ' + source + ' ' + parent + ':/zones/' + zone + '/root/' + target;
    console.log('executing %s', cmd);
    _exec(cmd, copied);
  });

	function copied(err) {
    if (err) console.error('error copying with command: ' + cmd);
    else console.log('COPY FINISHED');
    cb(err);
  }
}

function findParentAddress(cb) {
  _exec('mdata-get parent', function(err, stdout) {
    if (err) return cb (err);
    var parent = stdout.trim();
    if (! parent) cb(new Error('no parent defined in zone metadata'));
    else cb (null, parent);
  });
}

function escape(cmd) {
  return cmd.replace(/\'/, '\\\'');
}
