var express = require("express")
var router = express.Router()

router.get("/", function(req, res) {
    res.render("index.html")
})

router.get("/instructor", function(req, res) {
    res.render("instructor")
})

router.get("/student", function(req, res) {
    res.render("student")
})

module.exports = router