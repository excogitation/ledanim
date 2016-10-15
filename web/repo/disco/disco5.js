//fast blobs

bpm=control.slider({
    name:"BPM",
    category: "music",
    min:100,  
    max:200,
    default: 160
});   



color=control.color({
    name:"Color", 
    default: { r: 0, g:255, b:191 }

});

// led.mirror(30);

led.led_rnd(0, led.leds-20);
led.fade_mode(2);
led.fade_speed(8);

//fadein 
width=10;
fade_speed=40;

for (i=1;i<width;i=i+1)
{ 
    led.color(
        color.r / (fade_speed/i),
        color.g / (fade_speed/i), 
        color.b / (fade_speed/i)
    );
    led.draw();
}

for (i=width;i>1;i=i-1)
{ 
    led.color(
        color.r / (fade_speed/i),
        color.g / (fade_speed/i), 
        color.b / (fade_speed/i)
    );
    led.draw();
}



bpm=bpm*4;
led.interval(60000/bpm);


