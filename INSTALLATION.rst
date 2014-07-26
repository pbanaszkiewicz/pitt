.. _installation:

============
Installation
============

`Pitt <https://github.com/pbanaszkiewicz/pitt>`_ uses a few technologies and
software that has some system-wide dependencies.

Technologies used:

* `NodeJS <http://nodejs.org/>`_ for web server
* `Crossbar.io <http://crossbar.io/>`_ for messaging router
* `rfc5766-turn-server <https://code.google.com/p/rfc5766-turn-server/>`_ for auxiliary video proxy server

Everything either runs or is served from one global server.

.. Both `Crossbar.io`_ and `rfc5766-turn-server`_ are

How to install Pitt with web server
-----------------------------------

1. Install `NodeJS`_. ``npm`` (package manager) should get installed alongside.

2. Go to directory where you cloned `Pitt`_ into and install all dependencies
   with::

    npm install

3. If you can't install `Pitt`_, please go to https://github.com/pbanaszkiewicz/pitt/issues
   and report an issue.

How to install other services
-----------------------------

1. To install `Crossbar.io`_ simply::

    sudo pip install crossbar

2. To install `rfc5766-turn-server`_: go to http://turnserver.open-sys.org/downloads/,
   select the version you want to use (as of today, v3.2.3.95 has been
   tested successfully with `Pitt`_) and download the package for your
   operating system.

How to run everything
---------------------

To run `Crossbar.io`_, go to `Pitt`_ diretory and::

    $ cd pitt/server
    $ crossbar start

To run `rfc5766-turn-server`_, invoke::

    $ sudo turnserver -L YOURHOST -a -b /etc/turnuserdb.conf -f -r peerinstruction

File ``/etc/turnuserdb.conf`` contains only this one line::

    peer:0x310645b3b56a9d2b4c1f432ddc8e6593

Which is credentials for user ``peer`` with password ``peerinstruction`` on
``peerinstruction`` realm.

Finally, to run `Pitt`_, do::

    $ cd pitt/server
    $ ./server.js

That's it!

.. warning::
    If you use the TURN server (like rfc5766) you will need to change PeerJS
    configuration. Go to ``pitt.js`` and look for ``"iceServers"`` list.