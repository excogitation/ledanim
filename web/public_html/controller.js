//(C)2016 Edwin Eefting - edwin@datux.nl


//wait until emscripten is ready:
Module={};
Module['onRuntimeInitialized']=function()
{

    //wait until document is ready:
    $( document ).ready( function()
    {

        function status_ok(txt)
        {
            $("#status_bar").text(txt).removeClass("status_error status_processing").addClass("status_ok");
        }

        function status_processing(txt)
        {
            $("#status_bar").text(txt).removeClass("status_error status_ok").addClass("status_processing");
        }

        function status_error(txt)
        {
            $("#status_bar").text(txt).removeClass("status_processing status_ok").addClass("status_error");
        }


        function load_settings()
        {
            var settings_json=localStorage.getItem("settings");
            if (settings_json)
            {
                settings=JSON.parse(settings_json);
            }
            else
            {
                //default settings
                settings=
                {
                    leds: 160,
                    ledsim_size: 10,
                    auto_send: true,
                }
            }

            $("#program_name").val(settings.program_name);
            $("#settings_leds").val(settings.leds);
            $("#settings_ledsim_size").val(settings.ledsim_size);

            //load last editor contents from localstorage
            if (localStorage.hasOwnProperty("current_program"))
            {
                editor.setValue(localStorage.getItem("current_program"),1);
            }

        }

        function save_settings()
        {
            var leds=Number($("#settings_leds").val());
            if (leds<1 || leds > Module.MAX_LEDS)
            {
                status_error("Number of leds should be between 1 and "+Module.MAX_LEDS);
                return (false);
            }

            var ledsim_size=Number($("#settings_ledsim_size").val());
            if (ledsim_size<1 || ledsim_size>40)
            {
                status_error("led size should be between 1 and 40");
                return (false);
            }

            var program_name=$("#program_name").val();
            if (! program_name.match(/\.js$/))
            {
                status_error("program name should end with .js");
                return (false);
            }

            localStorage.setItem("current_program", editor.getValue());

            settings.leds=leds;
            settings.ledsim_size=ledsim_size;
            settings.program_name=program_name;

            localStorage.setItem("settings", JSON.stringify(settings));
            status_ok("settings saved");
            return(true);
        }


        //strip_animator class and command array
        var strip_anim=new Module.strip_anim_c();
        animation_id=0;

        // start ledstrip simulator via canvas
        function init_canvas()
        {

            /////////////////////////////////// prepare canvas

            //fast pixel manipulation code borrowed from http://jsfiddle.net/andrewjbaker/Fnx2w/
            var canvas = document.getElementById('ledsim');
            var canvasWidth  = canvas.width;
            var canvasHeight = canvas.height;

            canvas_context = canvas.getContext('2d');


            image_data = canvas_context.getImageData(0, 0, canvasWidth, canvasHeight);

            var image_buf = new ArrayBuffer(image_data.data.length);
            image_buf8 = new Uint8ClampedArray(image_buf);
            image_data32 = new Uint32Array(image_buf);

            // Determine whether Uint32 is little- or big-endian.
            image_data32[1] = 0x0a0b0c0d;

            is_little_endian = true;
            if (image_buf[4] === 0x0a && image_buf[5] === 0x0b && image_buf[6] === 0x0c && image_buf[7] === 0x0d)
            {
                is_little_endian = false;
            }

            //make unused leds gray so you know where the "strip" ends
            for (var l=0; l< canvasWidth*canvasHeight; l++)
            {
                image_data32[l]=0x66666666;
            }

        }


        /// animate one step and update canvas
        function step()
        {
            animation_id=requestAnimationFrame(step);
            strip_anim.step();


            var rgb;
            if (is_little_endian)
            {
                //optimized a bit to make loop cheaper
                for (var l=0;l<led.leds;l++)
                {
                    rgb=strip_anim.get_led(l);
                    image_data32[l] =
                    (255   << 24) |    // alpha
                    (rgb.b << 16) |    // blue
                    (rgb.g <<  8) |    // green
                    rgb.r;            // red
                }
            }
            else
            {
                for (var l=0;l<led.leds;l++)
                {
                    image_data32[l] =
                    (rgb.r << 24) |    // red
                    (rgb.g << 16) |    // green
                    (rgb.b <<  8) |    // blue
                    255;              // alpha
                }
            }

            image_data.data.set(image_buf8);
            canvas_context.putImageData(image_data, 0, 0);
        }


        //uploads commands but makes sure there is never more than one request at a time
        var uploading=false;
        var upload_next;
        function upload_commands(commands)
        {
            //some conversion magic to do essentially a raw-data upload
            var plain_array=new Array();
            for (var i=0; i<commands.size(); i++)
            {
                plain_array[i]=commands.get(i);
            }
            var uint8_array=new Uint8Array(plain_array);
            var blob = new Blob([uint8_array], { type: "application/octet-binary"});
            var form_data = new FormData();
            form_data.append("file", blob);

            //make sure we only have one request paralllel and always send the latest data
            if (uploading)
            {
                upload_next=form_data;
                return;
            }

            function start()
            {
                uploading=true;
                status_processing("Uploading to led strip...");
                var oReq = new XMLHttpRequest();
                oReq.open("POST", settings.url+"set_commands", true);
                oReq.onload = function (oEvent) {
                    status_ok("Uploaded to led strip.");
                    if (upload_next)
                    {
                        form_data = upload_next;
                        upload_next=undefined;
                        start();
                    }
                    else
                    {
                        uploading=false;
                    }
                };
                oReq.send(form_data);
            }

            start();

        }

        //get current program from editor and compile it
        // var last_program="";
        function compile_editor()
        {
            if (animation_id)
            {
                cancelAnimationFrame(animation_id);
            }
            save_settings();


            try
            {
                status_processing("Compiling program...");
                control._begin(settings.program_name);
                led._begin();
                eval(editor.getValue());
                control._end();
                led._end();
                error="";
            }
            catch(e)
            {
                error=String(e);
            }

            if (error)
            {
                status_error(error);
            }
            else
            {
                status_ok("Compiled ok");
                $("#compile_size").text(led.commands.size());
                strip_anim.set_commands(led.commands);
                step();

                upload_commands(led.commands);
            }
        }
        control.compiler=compile_editor;

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

        function update_local_animation_list()
        {
            $(".local_animation:not(.template)").remove();

            $.each(Object.keys(localStorage), function(nr, key)
            {
                if (key.match("^program "))
                {
                    var clone=clone_template($(".local_animation.template"))
                    var program_name=key.replace(/^program /, "");
                    $(".local_program_name", clone).text(program_name.replace(/\.js$/,""));
                    $(".local_animation_click", clone).data("program_name", program_name);
                }
            });

        }


        function update_animation_list(url, repo)
        {
            for(category in repo)
            {
                var category_element=clone_template($(".category.template"));
                $(".category_title", category_element).text(category);

                for(animation in repo[category])
                {
                    var animation_element=clone_template($(".animation.template", category_element));
                    $(".program_name", animation_element).text(animation.replace(/\.js$/,""));
                    $(".animation_desc", animation_element).text(repo[category][animation]);
                    $(".animation_click", animation_element).data("url", url+category+"/"+animation);
                    $(".animation_click", animation_element).data("animation", animation);
                    $(".animation_click", animation_element).data("category", category);
                }
            }
        }

        function load_animation_repo(url)
        {
            var index_url=url+"index.json";
            status_processing("Downloading animation list...");

            $.ajax(index_url, {
                dataType: "json",
                error: function(xhr, status, text)
                {
                    status_error("Error while loading "+index_url+": "+ text);
                },
                // succces:
            }).done(function(data)
            {
                update_animation_list(url, data);
                status_ok("Animation list downloaded");
            });
        }


        var timeout;
        function delayed(func)
        {
            clearTimeout(timeout);
            timeout = setTimeout(func, 300);
        }

        //scale led pixels to correct size
        function scale_canvas()
        {
            var screen_width=$("#ledsim").width();

            var canvas_columns=Math.floor(screen_width/settings.ledsim_size);
            var canvas_rows=Math.floor(settings.leds/canvas_columns)+1;

            $("#ledsim").attr("height", canvas_rows);
            $("#ledsim").attr("width", canvas_columns);
            $("#ledsim").css("height",  canvas_rows*settings.ledsim_size );
        }

        //// INITIALISATION

        $(".remove-after-load").remove();
        $(".hide-during-load").removeClass("hide-during-load");

        ///jquery ui stuff
        $("button").button();


        //ace editor
        var editor = ace.edit("editor");
        ace.config.set('basePath', '/jslib/ace');
        editor.setTheme("ace/theme/twilight");
        editor.getSession().setMode("ace/mode/javascript");
        editor.$blockScrolling = Infinity;

        load_settings();

        if (!settings.url)
            settings.url=window.location.protocol+"//"+window.location.host+"/";

        led.leds=settings.leds;


        // $(window).resize(function()
        // {
        //     scale_canvas();
        // });
        scale_canvas();

        strip_anim.set_used_leds(led.leds);

        update_local_animation_list();

        init_canvas();

        compile_editor();

        load_animation_repo("https://raw.githubusercontent.com/psy0rz/ledanim/master/web/repo/");

        //create tabs. ace editor needs extra attention
        $("#tabs").tabs({
            activate : function(event, ui) {
                if ($("a",ui.newTab).attr("href")=="#tab-edit")
                {
                    editor.resize();
                    editor.focus();

                }

            }
        });


        ////EVENT change led config
        $("#settings_update").on("click", function() {
            if (save_settings())
            {
                document.location.reload();

            }
        });

        ////EVENT atx power control
        $("#power_off").on("click", function() {
            $.ajax(settings.url+"off");
        });

        $("#power_on").on("click", function() {
            $.ajax(settings.url+"on");
        });

        ////EVENT when user changes the program, recompile and save it after a short delay
        editor.on("change", function() {
            delayed(function() {
                control.keep=false;
                compile_editor();
            });
            return false;
        });




        ///EVENT download button
        $("#download").click(function(){
            download($("#program_name").val(), editor.getValue());
            return false;
        });

        ///EVENT save button
        $("#save").click(function(){

            if (save_settings() && settings.program_name)
            {
                localStorage.setItem("program "+settings.program_name, editor.getValue());
                update_local_animation_list();
                status_ok("program saved");
            }
            return false;
        });


        ///EVENT local load button
        $("body").on("click", ".local_animation_click", function()
        {
            var program_name=$(this).data("program_name");
            editor.setValue(localStorage.getItem("program "+program_name),1);
            $("#program_name").val(program_name);
            return false;
        });

        ///EVENT local delete
        $("#delete").click(function()
        {
            localStorage.removeItem("program "+$("#program_name").val());
            update_local_animation_list();
            status_ok("local animation deleted");
            return false;
        });


        //EVENT user clicked an animation to load
        $("#tab-animations").on("click", ".animation_click", function(e)
        {
            var clicked=$(this);
            var url=clicked.data("url");
            status_processing("Downloading animation "+url);

            $.ajax(url,
                {
                    dataType: "text",
                    error: function(xhr, status, text)
                    {
                        status_error("Error while loading "+url+": "+ text);
                    },
                    // succces:
                }).done(function(data)
                {
                    status_ok("Download of animation ok");
                    $("#program_name").val(clicked.data("animation"));
                    editor.setValue(data,1);
                });


            })

            return false;
        });

    };
