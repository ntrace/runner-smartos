![Logo](../images/logo.png)

# Installing a Runner

For installing a runner is a series of manual steps.

In the future we'll have prepared images that get downloaded and installed. We'll get there :)

This are roughly the steps I remember that you need to get a runner running (sorry for the pun). I'm surely missing a lot of vital steps here, so bear with me, this will be an ongoing process of improvement. The goal is to have this provisioning fully automated, but we still need to work out some kinks before we fully get there.

Also, this approach is good to question and improve things as we make this platform better.


## A SmartOS machine

A runner is a Node.js process that runs on a machine that's running SmartoOS (for the time being).

To install a runner you must have a SmartOS VM. Personally, I use VMWare Fusion and the latest SmartOS image for it. (I know, I'm too lazy to use VirtualBox, but all kinds of people have reported problems running SmartOS on it, so I'm sticking with VMWare Fusion for development)

## Customize an image

Follow these instructions until step 1.5

https://gist.github.com/pgte/6246581

With these caveats:

1. I haven't been able to use a VM manifest with DHCP, but it can be my local setup (I've been using a mifi for the past 3 weeks). I've had to use a hard-coded IP address.
2. Use the correct `resolvers` for your local network.

On step 1.5 do the following custom installations on the VM:

* Install build-essential with: `pkgin install build-essential`
* Download and instal node
* Configure node with these flags: `./configure --with-dtrace --dest-cpu=x64`
* make and install node globally
* add `/usr/local/bin` to the beginning of PATH on `/root/.profile` so that the new node exec gets picked up first

Install stackvis:

```
$ npm install stackvis
```

Continue with steps 1.6 and beyond


# Install and start the runner

The runner must be installed on a new VM with the new image, for which you must create a VM manifest and use `vmadm create < manifest.json`.

## set the global zone ip address

After the VM is created, edit the customer metadata file (/zones/<uuid>/config/metadata.json) (in the global zone) and add to the customer section:

```javascript
{"parent":"<global zone ip address>"}
```

To test this setting zlogin into the runner vm and try:

```bash
$ mdata-get parent
```

It should return the global zone IP address.

This is for the runner VM to be able to know the global zone ip address to ssh to.

## runner ssh key

Also, the global zone must have and trust a public ssh key of the runner vm. For that, zlogin into the runner, generate a key and copy the public part into the global zone.

Follow [this guide](http://www.perkin.org.uk/posts/smartos-global-zone-tweaks.html) (section "Upload a root authorized_keys file") to persist the ssh key in the global zone.

## Install the runner in the runner VM

zlogin into that new VM and install the runner source code.

Start the runner from the command line:

```
$ npm start
```


# Create a worker VM

Create a worker VM from the same base image as you created the runner VM.

Create a snapshot of that VM named `clean`:

```bash
$ vmadm create-snapshot <uuid> clean
```

# Add the worker to the runner

Connect to the worker using `nc`:

```bash
nc localhost 9182
```

You can then type the command to enroll a worker VM:

```javascript
["enroll", ["<uuid>"], 1]
```

(replace `uuid` with the worker VM uuid).


# Create an ssh tunnel between the dispatcher and the runner

For that I use [autossh](http://www.harding.motd.ca/autossh/)

FIXME: Add autossh script template here.

The dispatcher is, in development mode, running directly on your development machine, and you must have sshd enabled on your development machine. If you have a Mac [here are some instructions](http://bluishcoder.co.nz/articles/mac-ssh.html) on how to enable sshd.

It must tunnel local port 9181 on the runner VM into port 9181 of your local dev machine.

(The dispatcher is a process on your local machine that is listening on port 9818)


# Run the dispatcher

On your local machine, not the SmartOS VM.

1. Clone the ntrace repo.
1. `cd dispatcher`
1. `npm i`
1. `npm start`

The runner on the SmartOS VM then connects to the dispatcher using the ssh tunnel into the dispatcher port 9181.


# Push some work into the dispatcher

Connect to the dispatcher in your local dev machine:

```bash
$ nc localhost 9181
```

Push some repo:

```javascript
["push", ["dscape", "nano", "0f16cfe0d6a3b8e87229c91bee901fad5dae9878"], 1]
```

(There is a bug in the runner that silently ignores pushes now and then. Juts insist and it will get through. Fixing that.)



# Some random references:

* [https://twitter.com/pgte/status/364813459826810882](tweet conversation between pgte and antonwhalley)
* [http://stackoverflow.com/questions/16616373/node-js-profiling-with-dtrace-not-showing-functions-names/17625967#17625967](compile node and dtrace)
* [Global zone tweaks](http://www.perkin.org.uk/posts/smartos-global-zone-tweaks.html)