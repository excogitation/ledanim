$(document).ready(function()
{

    //strip_animator class and command array
    var strip_anim=new Module.strip_anim_c();

    // start ledstrip simulator via canvas
    function start_ledsim(){

        /////////////////////////////////// prepare canvas
        var MAX_LEDS=Module.MAX_LEDS;

        //fast pixel manipulation code borrowed from http://jsfiddle.net/andrewjbaker/Fnx2w/
        var canvas = document.getElementById('ledsim');
        var canvasWidth  = canvas.width;
        var canvasHeight = canvas.height;
        var ctx = canvas.getContext('2d');
        var imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);

        var buf = new ArrayBuffer(imageData.data.length);
        var buf8 = new Uint8ClampedArray(buf);
        var data = new Uint32Array(buf);

        // Determine whether Uint32 is little- or big-endian.
        data[1] = 0x0a0b0c0d;

        var isLittleEndian = true;
        if (buf[4] === 0x0a && buf[5] === 0x0b && buf[6] === 0x0c && buf[7] === 0x0d)
        {
            isLittleEndian = false;
        }

        /// animate one step and update canvas
        function step()
        {
            requestAnimationFrame(step);
            strip_anim.step();


            var rgb;
            for (led=0;led<MAX_LEDS;led++)
            {
                rgb=strip_anim.get_led(led);
                // ctx.fillStyle = "rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")";
                // ctx.fillRect(led*12, 10, 10,10);
                if (isLittleEndian) {
                    data[led] =
                    (255   << 24) |    // alpha
                    (rgb.b << 16) |    // blue
                    (rgb.g <<  8) |    // green
                    rgb.r;            // red
                } else {
                    data[led] =
                    (rgb.r << 24) |    // red
                    (rgb.g << 16) |    // green
                    (rgb.b <<  8) |    // blue
                    255;              // alpha
                }
            }

            imageData.data.set(buf8);
            ctx.putImageData(imageData, 0, 0);
        }
        step(); //start

    }

    //get current program from editor and compile it
    // var last_program="";
    function compile_editor(editor)
    {
        var lines=editor.getSession().getDocument().getAllLines();
        localStorage.setItem("current_program", editor.getValue());
        localStorage.setItem("current_program_name", $("#program_name").val());
        var commands=new Module.commands_t();
        var error=assemble_commands(lines, commands);
        if (error)
        {
            $("#compiler_msg").text(error[2]);
            $("#compiler_msg").addClass("error");

            editor.getSession().setAnnotations([{
                row: error[0]-1,
                column: 0,
                text: error[2],
                type: "error" // also warning and information
            }]);
        }
        else
        {
            $("#compiler_msg").text("Compiled ok.");
            $("#compiler_msg").removeClass("error");
            editor.getSession().clearAnnotations();
            strip_anim.set_commands(commands);
        }
        commands.delete();
        // }
    }

    //download a string as a textfile
    //from http://stackoverflow.com/questions/3665115/create-a-file-in-memory-for-user-to-download-not-through-server
    function download(filename, data) {
        var blob = new Blob([data], {type: 'text/plain'});
        if(window.navigator.msSaveOrOpenBlob) {
            window.navigator.msSaveBlob(blob, filename);
        }
        else{
            var elem = window.document.createElement('a');
            elem.href = window.URL.createObjectURL(blob);
            elem.download = filename;
            document.body.appendChild(elem);
            elem.click();
            document.body.removeChild(elem);
        }
    }

    function update_quickload_list()
    {
        $(".quick_load").remove();
        $.each(Object.keys(localStorage), function(nr, key)
        {
            if (key.match("^program "))
            {
                var clone=$(".quick_load_template").clone();
                clone.removeClass("quick_load_template");
                clone.addClass("quick_load");
                clone.insertAfter($(".quick_load_template")).text(key.replace(/^program /, ""));
            }
        });
        // localStorage.setItem("program "+$("#program_name").val(), editor.getValue());

    }

    //// INITIALISATION

    //ace editor
    var editor = ace.edit("editor");
    editor.setTheme("ace/theme/twilight");
    editor.$blockScrolling = Infinity;

    //load last editor contents from localstorage
    if (localStorage.hasOwnProperty("current_program"))
    {
        editor.setValue(localStorage.getItem("current_program"),1);
        $("#program_name").val(localStorage.getItem("current_program_name"));
    }

    update_quickload_list();
    compile_editor(editor);

    start_ledsim();

    ////EVENT when user changes the program, recompile and save it after a short delay
    var wto;
    editor.on("change", function() {
     $("#compiler_msg").html("&nbsp;");
     $("#compiler_msg").removeClass("error");
     clearTimeout(wto);
     wto = setTimeout(function() {
         compile_editor(editor);
    }, 300);
    });


    ///EVENT download button
    $("#download").click(function(){
        download($("#program_name").val()+".txt", editor.getValue());
    });

    ///EVENT save button
    $("#save").click(function(){
        if ($("#program_name").val())
        {
            localStorage.setItem("program "+$("#program_name").val(), editor.getValue());
            update_quickload_list();
        }
    });


    ///EVENT quick load button
    $("body").on("click", ".quick_load", function()
    {
        editor.setValue(localStorage.getItem("program "+$(this).text()),1);
        $("#program_name").val($(this).text());

    });

    ///EVENT quick delete
    $("#delete").click(function()
    {
        localStorage.removeItem("program "+$("#program_name").val());
        update_quickload_list();
    });

});