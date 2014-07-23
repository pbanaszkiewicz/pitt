// the STATE can go like this:
//  NOTHING → BROADCASTING, NOTHING → SMALL_GROUPS
//  BROADCASTING → SMALL_GROUPS
//  SMALL_GROUPS → COUNTDOWN
//  COUNTDOWN → NOTHING, COUNTDOWN → BROADCASTING
var STATE = {
    NOTHING: 0,  // nothing's happening
    BROADCASTING: 1,  // some instructor is broadcasting
    SMALL_GROUPS: 2,  // students talk in small groups
    COUNTDOWN: 3  // small group discussions should end as soon as countdown
                  // finishes
}

var DEBUG = 2;  // used by PeerJS

// simple hack to support as many browsers as possible
navigator.getUserMedia = navigator.getUserMedia ||
                         navigator.webkitGetUserMedia ||
                         navigator.mozGetUserMedia

// just as simple hack to remove unnecessary prefixes from Audio API
window.AudioContext = window.AudioContext ||
                      window.webkitAudioContext