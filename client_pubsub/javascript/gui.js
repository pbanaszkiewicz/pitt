var GUI = GUI || {}

GUI.GUI = function(doc) {
    var INTERFACE = {}
    // var $ = doc
    var user_id

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

    return INTERFACE
}