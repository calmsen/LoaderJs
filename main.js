requirejs.config({
    baseUrl: "/LoaderJs"
    , paths: {
        "Test1": "/Test1.js?v=234"
        , "Test2": "/Test2?v=456"
        , "Test3": "/Test3"
    }
    , shim: {
        "Test1": {deps: ["Test2"], init: function(){
        }, exports: "Test1"}
    }
    , pathVersions: {"/Test3": 45674}
});


