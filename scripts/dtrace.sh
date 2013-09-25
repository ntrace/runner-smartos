#!/bin/bash

set -e

/usr/sbin/dtrace -q -c "$1" -n 'profile-97/pid == $target && arg1/{ @[jstack(150,8000)] = count(); }' | /opt/local/bin/c++filt | /usr/local/bin/stackcollapse
