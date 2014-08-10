====
Pitt
====

Peer Instruction Teaching Tool

License
-------

This code is licensed under
`MIT License <http://opensource.org/licenses/MIT>`_.

This repository was started as a fork of David Rio Deiros' work, and his code
is licensed under whatever he decides to.  Current codebase, however, doesn't
use David's code and is MIT licensed.

Scope
-----

We want to build a web application that implements the peer instruction
`teaching technique <http://software-carpentry.org/blog/2014/02/online-peer-instruction-tool.html>`_
using the `WebRTC <http://www.webrtc.org/>`_ technology and
`PeerJS <http://peerjs.com/>`_ project.

In the Pitt, we have two types of roles: instructors and students, and two
types of running modes: one-to-many broadcast and many few-to-few discussions.
In the first mode the instructor is broadcasting their audio and video to the
students.  In the second mode students talk among them.

The key functionality of this project is to allow instructors to **quickly**
switch from broadcasting to small-group-discussions mode and back.

Installation
------------

Please follow the official
`installation docs <https://github.com/pbanaszkiewicz/pitt/blob/develop/INSTALLATION.rst>`__.

Short version::

    sudo aptitude install nodejs
    sudo npm install -g grunt-cli
    sudo pip install crossbar

    git clone https://github.com/pbanaszkiewicz/pitt.git
    cd pitt
    npm install
    grunt dev

Documentation
-------------

Following documents contain information about application structure and travelling signals:

* `STRUCTURE.rst <https://github.com/pbanaszkiewicz/pitt/blob/develop/STRUCTURE.rst>`__

History
-------

v0.5 (2014-08-10)
  Better interface for both desktops and tablets, but not for phones.  Very
  basic chat.  Task automation and generally slimmer front-end code.
  Voice-only connections improvements.  Improved installation docs a little
  bit.  Changed this section ordering (newest first).

v0.4.1 (2014-07-26)
  Added docs (installation, contributing, authors/contributors, application
  structure and signalling).  Turned beep volume down.  Dropped "_pubsub" from
  directories and one file names.  Forced "640px by something" resolution --
  not every browser lets use 640x480, so Pitt forces only width, and height
  should be set automatically.

v0.4 (2014-07-21)
  Reworked everything to leverage JavaScript patterns, fixed (hopefully!)
  signalling within application, turned on TURN server, refreshed the interface
  (thanks to Bootstrap).

v0.3.1 (2014-06-29)
  Added license (MIT), better ``package.json``, countdown before switching
  from small group discussions, variable room size, removed echo sound on local
  streams.

v0.3 (lost in time)
  ...?

v0.2 (lost in time)
  Reworked architecture, quick mode-switching.

v0.1 (2014-06-15)
  First buggy release.