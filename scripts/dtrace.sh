#!/bin/bash

set -e

/usr/sbin/dtrace -q -c ./run.js -n 'profile-97/execname == "node" && arg1/{ @[jstack(150,8000)] = count(); }' | /opt/local/bin/c++filt | /usr/local/bin/stackcollapse