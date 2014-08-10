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
* `Grunt <http://gruntjs.com/>`_, a task automation tool for NodeJS

Everything either runs or is served from one global server.

How to install Pitt
-------------------

1. Install `NodeJS`_ and `Grunt`_ (the CLI tool) on your system.  A package
   manager for Node, ``npm`` will be automatically installed, too.

2. Install `Crossbar.io`_::

    sudo pip install crossbar

3. To install `rfc5766-turn-server`_: go to
   http://turnserver.open-sys.org/downloads/, select the version you want to
   use (as of today, v3.2.3.95 has been tested successfully with `Pitt`_) and
   download the package for your operating system.

4. Clone `Pitt`_ (you can also
   `download it <https://github.com/pbanaszkiewicz/pitt/archive/develop.zip>`__
   instead)::

    git clone https://github.com/pbanaszkiewicz/pitt.git

5. Go to `Pitt`_ root directory and install all dependencies with::

    npm install

6. If you can't install `Pitt`_, please go to
   https://github.com/pbanaszkiewicz/pitt/issues and report the issue.

Set up additional server
------------------------

The `rfc5766-turn-server`_ is not necessary, but may help with connecting users
that due to some NAT-born obstacles.

If you want to run it, invoke::

    sudo turnserver -L YOURHOST -a -b /etc/turnuserdb.conf -f -r peerinstruction

File ``/etc/turnuserdb.conf`` contains only this one line::

    peer:0x310645b3b56a9d2b4c1f432ddc8e6593

Which is credentials for user ``peer`` with password ``peerinstruction`` on
``peerinstruction`` realm.

You also need to change file ``client/javascript/globals.js`` and point it to
your ``HOST``::

    var ICE_SERVERS = [
        // rfc5766 STUN&TURN server
        {
            url: "turn:YOURHOST:3478",
            username: "peer",
            credential: "peerinstruction"
        },
        {
            url: "stun:stun.l.google.com:19302"
        }
    ]

How to run everything
---------------------

You need to compile front-end files (JavaScript and CSS), too.  But this
depends on the way you want to run `Pitt`_: in development (easier) or in
production (more stable) mode.

Development
~~~~~~~~~~~

Run `Pitt`_ with `Crossbar.io`_ and watch-dog that compiles all assets and
restarts web server if necessary::

    grunt dev

Production
~~~~~~~~~~

1. Minify front-end files::

    grunt prod

2. Run `Crossbar.io`_::

    crossbar start --cbdir server/.crossbar

3. Finally run `Pitt`_::

    node ./server/server.js

That's it!