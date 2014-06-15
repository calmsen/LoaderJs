define("Test3", ["Test2"], function(Test2) {
    return function() {
        console.log("Конструктор Test3.")
        new Test2();
    };
})


