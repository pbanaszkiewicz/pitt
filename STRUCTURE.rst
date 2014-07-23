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

Broadcaster
  An instructor that streams to everyone (ie. all students and other
  instructors).

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

Room
  This is official name for a group of students in SMALL GROUPS mode.  First
  group is called ``room0``, second ``room1``, etc.

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

Not every browser correctly handles exits and WebRTC streams are stateless,
therefore the server sends the ping request to everyone every 60 seconds.
In the worst case scenario, a disconnected peer can be "frozen" for everyone
for at most 60 seconds (and by frozen I mean their stream not moving at all).

When someone joins / leaves, every peer automatically has to add/remove them
from either instructors list or students list.

If the application is in the state different from NOTHING, different scenarios
happen:

State BROADCASTING
  If instructor or student joins, they ask the broadcaster instructor to add
  them to the call.

  If instructor or student leaves, they simply close the audio/video call.

  If the broadcasting instructor leaves, all the calls are dropped and the
  state returns to NOTHING.

  Only the instructor who initiated the broadcast (and therefore is the
  broadcaster) is able to switch back from BROADCASTING to NOTHING.

State SMALL GROUPS
  If instructor joins, nothing happens.

  If student joins, they're added to the room with the least number of
  students.

  If the students leaves from the group discussion, and there is only one
  student left in that group, the lone student is being moved to the group
  with the least number of students and the empty room is removed.

  Any instructor is able to end SMALL GROUPS mode.  This switches to COUNTDOWN
  and then to NOTHING.

  If last instructor leaves, ie. there are no instructors left to switch to
  COUNTDOWN/NOTHING mode, the server switches to COUNTDOWN mode automatically.

State COUNTDOWN
  In this state, the server counts down to zero every second.  By default, the
  countdown starts from 30.  After reaching zero, the state changes to NOTHING
  and all the calls are dropped.

Typical workflow
----------------

1. Everyone joins
2. Instructor switches to BROADCASTING and streams their A/V to all students
   and all instructors.
3. If anyone new joins, the broadcaster calls them.
4. The broadcaster switches to small group discussions: students are split into
   groups of size specified by the instructors unless it's not possible.  For
   example 6 students can be easily split into pairs and trios.  However,
   7 students can only be split into: 2, 2, 3 (or 3, 4, or 4, 3, or 5,
   2, or 7) but **not into** 6, 1 (there can't be any student alone).
5. No additional functionality is implemented (like questions or voting).
6. Any instructor can end the split by switching to countdown mode.
7. After 30s (by default) the state switches to NOTHING.

Signals
-------

.. todo: split signal signatures into

.. function:: api:get_current_state(args, kwargs, details)

    Returns current state of the application.  It's mostly intended for
    newcomers, ie. people joining the session.

    :param list args: not used
    :param dict kwargs: the ``user_id`` contains newcomer's ID
    :param details: not used
    :returns: the list of students (``students``), the list of instructors
              (``instructors``), the current state (``state``),
              and additional data associated with that state (``state_data``)
              like the room for students to join.
    :rtype: dict