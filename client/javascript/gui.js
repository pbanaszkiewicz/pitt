var GUI = GUI || {}

GUI.GUI = function() {
    var INTERFACE = {}
    var user_id  // ID generated from PeerJS by PeerServer

    var audio_ctx  // general audio context instance
    var gain  // lower beep volume by using this gain

    var user_stream = $("#user_stream")
    var main_stream = $("#main_stream")
    var btn_start_split = $("#start_split_mode")
    var btn_stop_split = $("#end_split_mode")
    var btn_start_broadcast = $("#start_broadcasting")
    var btn_stop_broadcast = $("#stop_broadcasting")
    var div_countdown = $("#countdown_container")
    var counter = $("#split_countdown")
    var chatbox = $("#chatbox")
    var btn_message = $("#chat_message")

    var play_sound = function(frequency, interval, next_node) {
        // play the sound for given time (interval, ms)
        var beep = audio_ctx.createOscillator()
        beep.frequency.value = frequency

        if (next_node !== undefined) {
            beep.connect(next_node)
        }

        beep.start()
        setTimeout(
            function(osc) {
                osc.stop()
            },
            interval,
            beep
        )
    }

    var redraw_list = function(element, list, omitted_element) {
        // not every browser supports default arguments in JavaScript, so these
        // three lines are shamelessly borrowed from MDN:
        // https://developer.mozilla.org/
        //               en-US/docs/Web/JavaScript/Reference/default_parameters
        omitted_element = (typeof omitted_element !== 'undefined')
                           ? omitted_element
                           : "";

        var el = $(element)
        el.empty()

        $.each(list, function(index, value) {
            // easy omitting unwanted element (like current user's id)
            if (value !== omitted_element) {
                el.append("<li>" + value + "</li>")
            }
        })
    }

    function add_video_element(el, id, v_class, src, muted) {
        var video = $("<video>")
        video.prop("autoplay", true)
        video.prop("id", id)
        video.prop("class", v_class)
        video.prop("src", src)
        video.prop("muted", muted)
        video.prop("poster", "/img/white-noise-640x480.jpg")
        $(el).append(video)
    }

    function add_notification(parent, text) {
        var el = $("<li>")
        el.html("<i>" + text + "</i>")
        parent.append(el)
    }

    INTERFACE.init = function() {
        $("#user_id").text("Not connected")
        // -1 is not defined, therefore will trigger `default` action
        stateChange(-1, {})

        user_stream.on("click", function(e) {
            main_stream.prop("src", e.target.src)
            main_stream.addClass("local-stream")
        })
        $("#remote_streams").on("click", "video", function(e) {
            main_stream.prop("src", e.target.src)
            main_stream.removeClass("local-stream")
        })

        audio_ctx = new window.AudioContext()
        gain = audio_ctx.createGain()
        gain.gain.value = 0.1
        gain.connect(audio_ctx.destination)
    }

    INTERFACE.media_access = function(stream) {
        // at the beginning, users must agree to use their webcams and mikes
        // when we have access to user's stream, we put it in the "main" place.
        user_stream.prop("src", URL.createObjectURL(stream))
    }

    INTERFACE.media_error = function(error) {
        // oooops, something went terribly wrong.  Can't gain access to user's
        // webcam and/or mike.  This means application should simply quit
        // loudly…
        // idea:
        console.error("OH SHIT NO NO NO!!!")
    }

    var stateChange = function(state, state_data) {
        switch (state) {
            case STATE.NOTHING:
                btn_start_split.attr("disabled", false)
                btn_stop_split.attr("disabled", true)
                btn_start_broadcast.attr("disabled", false)
                btn_stop_broadcast.attr("disabled", true)
                div_countdown.hide()
                // we should clear streams when there's nothing to show
                main_stream.prop("src", "")
                main_stream.removeClass("local-stream")
                $("#remote_streams").empty()
                break

            case STATE.BROADCASTING:
                broadcaster = state_data.broadcaster
                btn_stop_split.attr("disabled", true)
                btn_start_broadcast.attr("disabled", true)
                // we want to prevent other instructors from ending
                // broadcaster's broadcast.  And causing lots of errors…
                btn_start_split.attr("disabled",
                                     broadcaster === user_id ? false : true)
                btn_stop_broadcast.attr("disabled",
                                        broadcaster === user_id ? false : true)
                div_countdown.hide()

                add_notification(chatbox, broadcaster + " is now broadcasting.")

                break

            case STATE.SMALL_GROUPS:
                initializer = state_data.initializer
                btn_start_split.attr("disabled", true)
                // any instructor can end split mode
                btn_stop_split.attr("disabled", false)
                // btn_stop_split.attr("disabled",
                //                     initializer === user_id ? false : true)
                btn_start_broadcast.attr("disabled", true)
                btn_stop_broadcast.attr("disabled", true)
                div_countdown.hide()
                break

            case STATE.COUNTDOWN:
                btn_start_split.attr("disabled", true)
                btn_stop_split.attr("disabled", true)
                btn_start_broadcast.attr("disabled", true)
                btn_stop_broadcast.attr("disabled", true)
                div_countdown.show()
                break

            default:
                btn_start_split.attr("disabled", true)
                btn_stop_split.attr("disabled", true)
                btn_start_broadcast.attr("disabled", true)
                btn_stop_broadcast.attr("disabled", true)
                div_countdown.hide()
        }
    }
    INTERFACE.onStateChange = stateChange

    INTERFACE.onUpdateUserId = function(id) {
        user_id = id
        $("#user_id").text(user_id)
    }

    INTERFACE.onUpdateStudents = function(students) {
        redraw_list("#students_list", students, user_id)
    }

    INTERFACE.onUpdateInstructors = function(instructors) {
        redraw_list("#instructors_list", instructors, user_id)
    }

    INTERFACE.onStartBroadcasting = function(start_broadcast_callback) {
        btn_start_broadcast.click(function() {
            start_broadcast_callback(
                function(stream) {
                    console.log("User media access granted")
                },
                function(error) {
                    console.error("Can't access user media!", error)
                }
            )
        })
    }

    INTERFACE.onStopBroadcasting = function(stop_broadcast_callback) {
        btn_stop_broadcast.click(function() {
            stop_broadcast_callback()
            $("#video_" + user_id).remove()
        })
    }

    INTERFACE.onIncomingCall = function(stream, call) {
        // 1. get properties from `call` object (PeerJS MediaConnection)
        var src = URL.createObjectURL(stream)
        // 2. add the video somewhere
        add_video_element("#remote_streams", "video_" + call.peer,
                          "remote-stream medium-size video-thumbnail", src,
                          false)
    }

    INTERFACE.onDroppedCall = function(peer_id, reason) {
        console.log("Removing video from", peer_id)
        $("#video_" + peer_id).remove()
    }

    INTERFACE.onSplitStudents = function(split_mode_callback) {
        btn_start_split.click(function() {
            size = $("#split_size").val()
            split_mode_callback(size)
        })
    }

    INTERFACE.onBackToBroadcast = function(countdown_callb, stop_split_callb) {
        btn_stop_split.click(function() {
            countdown_callb(30)
            // stop_split_callb()
        })
    }

    INTERFACE.onUpdateStudentsInRoom = function(students) {
        redraw_list("#room_peers_list", students, user_id)
    }

    INTERFACE.onUpdateCountdown = function(time) {
        console.log("Counting down: ", time)
        counter.text(time)
        if (time % 10 == 0 || time <= 5) {
            console.log("beeping")
            play_sound(440, 500, gain)
        }
    }

    INTERFACE.onNewChatMessage = function(author, message, timestamp) {
        var element = $("<li>")
        element.html("<strong>" + author + "</strong> " + message)
        chatbox.append(element)
    }

    INTERFACE.onSendMessage = function(send_callback) {
        btn_message.keypress(function(e) {
            if(e.keyCode == 13) {
                console.log("Sending message:", e.target.value)
                send_callback(e.target.value)
                e.target.value = ""
            }
        })
    }

    return INTERFACE
}