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

Get the source code from here: https://github.com/pbanaszkiewicz/pitt.

To install Pitt you need 2 components: `Crossbar <http://crossbar.io/>`_ and
`NodeJS <http://nodejs.org/>`_.

First install Crossbar (globally or in a local Python virtual environment)::

    $ sudo pip install crossbar

Then `install NodeJS <http://nodejs.org/download/>`__ (you may as well install
it from your distribution's repository).

Finally, install required dependencies::

    $ cd pitt
    $ npm install

If you need more details about installation, please follow the official
`docs <https://github.com/pbanaszkiewicz/pitt/blob/develop/INSTALLATION.rst>`_.

Documentation
-------------

History
-------

v0.1 (2014-06-15)
  First buggy release.

v0.2 (lost in time)
  Reworked architecture, quick mode-switching.

v0.3 (lost in time)
  ...?

v0.3.1 (2014-06-29)
  Added license (MIT), better ``package.json``, countdown before switching
  from small group discussions, variable room size, removed echo sound on local
  streams.

v0.4 (2014-07-21)
  Reworked everything to leverage JavaScript patterns, fixed (hopefully!)
  signalling within application, turned on TURN server, refreshed the interface
  (thanks to Bootstrap).

v0.4.1 (...)
  Added documentation.

v0.5 (...)
  Nothing yet.