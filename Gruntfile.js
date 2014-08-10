module.exports = function(grunt) {
  var banner = '/*! <%= pkg.name %> v<%= pkg.version %> ' +
               '<%= grunt.template.today("yyyy-mm-dd") %> */\n'
  var required_files = {
    instructor_output: 'client/build/<%= pkg.name %>_instructor.js',
    instructor_files: [
      'client/javascript/autobahn.js',
      'client/javascript/peer.js',
      'client/javascript/globals.js',
      'client/javascript/pitt.js',
      'client/javascript/gui.js',
      'client/javascript/init_instructor.js'
    ],

    student_output: 'client/build/<%= pkg.name %>_student.js',
    student_files: [
      'client/javascript/autobahn.js',
      'client/javascript/peer.js',
      'client/javascript/globals.js',
      'client/javascript/pitt.js',
      'client/javascript/gui.js',
      'client/javascript/init_student.js'
    ],

    css_output: 'client/build/<%= pkg.name %>.css',
    css_files: ['client/css/main.css']
  }


  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    /*
     *  P R O D U C T I O N
     */
    // minify for production
    uglify: {
      options: {
        banner: banner
      },
      production: {
        files: {
          'client/build/<%= pkg.name %>_instructor.js':
            required_files.instructor_files,
          'client/build/<%= pkg.name %>_student.js':
            required_files.student_files
        }
      }
    },

    // minify for production
    cssmin: {
      production: {
        options: {
          banner: banner
        },
        files: {
          'client/build/<%= pkg.name %>.css': required_files.css_files
        }
      }
    },

    /*
     *  D E V E L O P M E N T
     */
    // simply concatenate for development.  This way I don't have to have
    // conditionals within my HTLM templates, it's enough to put only:
    // <script src="/javascript/build/pitt_instructor.min.js"></script>
    // and it'll work for both environments: production and development
    concat: {
      options: {
        separator: ';'
      },
      development: {
        files: {
          'client/build/<%= pkg.name %>_instructor.js':
            required_files.instructor_files,
          'client/build/<%= pkg.name %>_student.js':
            required_files.student_files,
          'client/build/<%= pkg.name %>.css': required_files.css_files
        }
      }
    },

    // run server.js - this should restart upon changes within 'server.js'
    nodemon: {
      development: {
        script: 'server/server.js',
        options: {
          watch: ['server']  // watch for changes only in 'server' directory
        }
      }
    },

    // run crossbar router
    shell: {
      crossbar: {
        command: 'crossbar start --cbdir server/.crossbar',
        options: {
          stderr: false
        }
      }
    },

    // watch for changes in JS and CSS files
    watch: {
      development: {
        files: ['client/javascript/*.js', 'client/css/*.css'],
        tasks: ['concat'],
        options: {
          spawn: false
        }
      }
    },

    concurrent: {
      development: {
        tasks: ['shell:crossbar', 'nodemon:development', 'watch:development'],
        options: {
          logConcurrentOutput: true
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-cssmin');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-nodemon');
  grunt.loadNpmTasks('grunt-shell');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-concurrent');

  // TODO: add server.js as a grunt task in the future…
  grunt.registerTask('development', ['concurrent:development']);
  grunt.registerTask('dev', ['concurrent:development']);

  grunt.registerTask('production', ['uglify', 'cssmin']);
  grunt.registerTask('prod', ['uglify', 'cssmin']);
};