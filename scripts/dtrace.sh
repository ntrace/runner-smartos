#!/bin/bash

set -e

./run.js &
NODE_PID=$!
kill -STOP $NODE_PID

/usr/sbin/dtrace -q -c ./run.js -n 'profile-97/execname == "node" && arg1/{ @[jstack(150,8000)] = count(); }' | /opt/local/bin/c++filt | /usr/local/bin/stackcollapse &
DTRACE_PID=$!
sleep 4

kill -CONT $NODE_PID