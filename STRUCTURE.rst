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

A channel is like a common event that many peers subscribe to (ie. they're
instantly informed about anything new appearing on that channel).  This is
also called pub/sub architecture.  Any peer can publish on any channel they
want.  Any peer can receive events from channels they're subscribing.

On the other hand, an RPC is a function that can be invoked on only one peer
by any other peer.  Think of this as executing procedures on the server.
Except that you don't know who the server is.  So peers only know what they
want to execute, and the router manages data transmission between "peer who
runs RPC" (again, you can think of it as a server) and "peer who wants the RPC
to be run on someone" (sort of a client).

RPCs
~~~~

.. todo: write them down

``get_current_state``
  Called by
    any incoming peer

  Handles
    server

  Returns
    current state of the application.  If the current state is SMALL GROUPS,
    and the newcomer is student, the server returns additional
    ``state_data['join_room']`` that's a room ID for the student to join.  The
    join happens by publishing ``call_me_ROOMID`` with student's peer ID.

``init_split_mode``
  Called by
    any instructor

  Handles
    server

  Arguments
    ``size``: intended group size that students should be split into (for
    example pairs, trios, etc).

  Does:
    splits students into groups (rooms) - taking intended group size into
    account, but recalculating for actual number of students.  Ie. it checks if
    in the last room there's only one student left.  If so, the student is
    moved to the preceding room.

  Publishes
    ``split_mode_enabled`` with ``rooms``, ``students_in_rooms`` arguments.

  Returns
    current state.  It's not used, anyway.

``end_split_mode``
  Called by
    the server itself

  Handles
    server

  Does:
    clears internal ``rooms`` and ``students_rooms`` variables.

  Publishes
    ``split_mode_disabled``

  Returns
    current state.  It's not used, anyway.

``get_room_information``
  **DEPRECATED**.  Now information with room to join by students is published
  in ``split_mode_enabled``.

``start_counting_down``
  Called by
    any instructor (instead of ``end_split_mode`` they call this)

  Handles
    server

  Does:
    every second publishes ``counting_down`` with current time (usually 30,
    29, 28, … 2, 1, 0)

  Publishes
    if time == 0: ``state_changed`` with argument NOTHING.

``pong``
  Called by
    any peer

  Handles
    server

  Does:
    registers list of peers that respond to ``ping`` request (publication).


Pub/sub
~~~~~~~

.. todo: write them down

``new_student``
  Published by
    Students joining in.

  Who subscribes to it:
    everyone

``student_gone``
  Published by
    Students leaving.

  Who subscribes to it:
    everyone

``new_instructor``
  Published by
    Instructors joining in.

  Who subscribes to it:
    everyone

``instructor_gone``
  Published by
    Instructors leaving.

  Who subscribes to it:
    everyone

``state_changed``
  Published by
    server, instructor

  Who subscribes to it:
    everyone

  What it does:
    it means that the current state of the application has changed (to what's
    in the first argument) and everyone should react accordingly.

  Arguments
    ``args[0]``: new state.

``rooms_update``
  Published by
    server

  Who subscribes to it:
    students

  What it does:
    it means that rooms occupation has changed.  Probably some students left
    and others have been moved around.

  Arguments
    * ``kwargs["rooms"]``: rooms with corresponding students.
    * ``kwargs["students_in_rooms"]``: reverse relationship: students and
      corresponding rooms.

``split_mode_enabled``
  Published by
    server

  Who subscribes to it:
    students

  What it does:
    it means that students should start calling their peers.

  Arguments
    * ``kwargs["rooms"]``: rooms with corresponding students.
    * ``kwargs["students_in_rooms"]``: reverse relationship: students and
      corresponding rooms.

``split_mode_disabled``
  Published by
    server

  Who subscribes to it:
    students

  What it does:
    it means that students drop their calls.

  Arguments
    * ``kwargs["rooms"]``: rooms with corresponding students.
    * ``kwargs["students_in_rooms"]``: reverse relationship: students and
      corresponding rooms.

``call_me``
  Published by
    newcomers while in BROADCASTING state

  Who subscribes to it:
    Broadcaster

  What it does:
    it means that broadcaster should call to that newcomer.

  Arguments
    * ``args[0]``: peer (callee) ID
    * ``args[1]``: callee's room ID

``call_me_ROOMID``
  Published by
    new students joining in while in the SMALL GROUPS state.  **Also** everyone
    joining the room as soon as split mode enables.

  Who subscribes to it:
    All students, but they subscribe with ``ROOMID`` set to their room.

  What it does:
    it means that students within the room should call the incoming person.

  Arguments
    * ``args[0]``: peer (callee) ID
    * ``args[1]``: callee's room ID

``counting_down``
  Published by
    server

  Who subscribes to it:
    Every peer

  What it does:
    announces every second so that peers can update warning messages.  It's
    used as a hearing-aid for students to end their conversations soon.

  Arguments
    * ``args[0]``: time (30, 29, …, 2, 1, 0)

``ping``
  Published by
    server

  Who subscribes to it:
    Every peer

  What it does:
    informs peers that they should report their presence to the server.  Peers
    that don't answer the request (via ``pong``) are dropped.
