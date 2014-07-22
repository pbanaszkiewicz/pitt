.. _structure:

=========
Structure
=========

There's a number of issues and difficulties a real time communication
application such as Pitt has to face:

* current list of connected peers
* current working mode of the application
* communication (not only audio/video, but also simple messages) between peers
* discovering real network routes to specific peers

In this document I'll write down all design decisions I made, describe
application signals and structure in general.

Definitions
-----------

A few definitions first:

Peer
  Someone with a browser who uses Pitt application.

Instructor
  A peer that can control Pitt application.  His or her role is to teach
  students via webcam (or screenshare in future versions) and split students
  into small groups when necessary.

Student
  Any peer that is supposed to use Pitt for learning.

Server
  Right now Pitt can only work on one HTTP server.  In my configuration, there
  are actually three software servers running on one physical machine.  The
  term "server" corresponds to the Pitt NodeJS application.

Router
  An application (think of this as a software server with a different name)
  that distributes internal Pitt's messages across all connected peers.

STUN server
  A server that helps to provide peers with network routes to themselves.  Ie.
  it helps instructor A to call student B *directly*.

TURN server
  A server that, when direct connection fails, works as a "proxy" for peer
  calls.  Ie. when student C calls student D, but cannot find the way using
  STUN server, all traffic gets proxied through that TURN server.

Design decisions
----------------

Every peer (including Pitt server) has to keep the list of instructors and
students up-to-date locally.

Every peer the very first thing to do is ask for webcam access.  This is done
before it connects to the server.  It is required to deal with race conditions
between peers calling in each other (one can't answer the call when they don't
have their webcam stream).

There are these states within the application:

* NOTHING: no one is streaming
* BROADCASTING: one instructor is broadcasting to everyone else
* SMALL GROUPS: students are split into groups of small size (preferably
  between 2 and 6) and talk to each other in the peer-to-peer network
* COUNTDOWN: the server counts from 30 down to 0 -- and every second annouces
  this to all peers

