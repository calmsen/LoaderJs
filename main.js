requirejs.config({
    paths: {
        "Test1": "/LoaderJs/Test1"
        , "Test2": "/LoaderJs/Test2"
        , "Test3": "/LoaderJs/Test3"
    }
    , shim: {
        "Test1": {deps: ["Test2"], init: function(){
        }, exports: "Test1"}
    }
});


