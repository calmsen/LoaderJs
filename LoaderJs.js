LoaderJs = (function(window, $) {    
    function LoaderJs() {
        this.init.apply(this, arguments);
    }
    
    $.extend(LoaderJs.prototype = new Object(), {
        defaults: {
            urlArgs: "v=1.0.0"
            , waitSeconds: 60
            , baseUrl: ""
            , paths: {
                pathAlias: "/path/to/file/without/extension"
            }
            , shim: {
                pathAlias: {deps: [], init: $.noop(), exports: ""}
            }
            , pathVersions : {}
        }
        , files: {} // информация по загружаемым файлам
        , deps: {} // информация о зависемостях
        , defineCounter: 0
        , defineModules: []
        , defineQueue: $("<a/>")
        , rn: 0 // рандомное число для контроля выполнения require callback
        , init: function(options) {
            $.extend(true, this, this.defaults, options);
            this.normalizeBaseUrl();
            this.normolizeConfigPaths();
            this.normolizePathVersions();
            this.makeCompatibleWithRequireJs();
        }
        , makeCompatibleWithRequireJs: function() {
            var loaderJsObj = this;
            window.require = window.requirejs = function(deps, callback, rn) {
                loaderJsObj.require(deps, callback, rn);
            };
            window.define = function(moduleName, deps, init) {
                loaderJsObj.define(moduleName, deps, init);
            };
            window.require.config = function(options) {
                loaderJsObj.init(options);
            };
        }
        , require: function(deps, callback, rn) {
            this.loaderFiles(deps);
            var loaderJsObj = this;
            var rn = rn || this.rn;
            var depsHash = this.getDepsHash(deps);
            this.deps[depsHash].defObj.done(function() {
                if (loaderJsObj.rn != rn) return;
                callback.apply(window, loaderJsObj.deps[depsHash].params);
            });
        }
        , define: function(moduleName, deps, init) {
            this.defineCounter++;
            if (moduleName instanceof Function) {
                init = moduleName;
                deps = [];
                moduleName = "module-" + this.defineCounter;
            } else if (moduleName instanceof Array) {
                init = deps || $.noop;
                deps = moduleName;
                moduleName = "module-" + this.defineCounter;
            } else {
                moduleName = moduleName || "module-" + this.defineCounter;
                deps = deps || [];
                init = init || $.noop
            }
            this.defineModules[this.defineCounter] = {moduleName: moduleName, deps: deps, init: init};
            this.loaderFiles(deps);
        }
        , loaderFiles: function(deps) {
            var loaderJsObj = this;
            var depsHash = this.getDepsHash(deps);
            if (this.deps[depsHash] === undefined) {
                this.deps[depsHash] = {};
                var deferreds = [];
                var paths = [];
                for (var i in deps) {
                    if (!deps[i]) {
                        console.error("pathAlias не может быть пустым.");
                        return;
                    }                    
                    var pathData = this.parsePathAlias(deps[i]);
                    paths.push(pathData.path);
                    var defObj = $.Deferred();
                    deferreds.push(defObj);
                    this.files[pathData.path] = {
                        defObj: defObj
                        , content: ""
                        , type: pathData.type
                        , pathAlias: pathData.alias
                        , exports: undefined
                    }
                    this.loadFile(pathData.path);
                    if (pathData.alias != "" && this.shim[pathData.alias]) {
                        this.loaderFiles(this.shim[pathData.alias].deps || []);
                    }
                }
                this.deps[depsHash].defObj = $.when.apply($, deferreds).done(function() {
                    var params = [];
                    for (var i in paths) {                        
                        params.push(loaderJsObj.files[paths[i]].exports)
                    }
                    loaderJsObj.deps[depsHash].params = params;
                });
            }
        }
        , loadFile: function(path) {
            var loaderJsObj = this;
            $.ajax({
                url: path + (this.pathVersions[path.replace(/\.[a-z]+$/, "")] ? "?v=" + this.pathVersions[path.replace(/\.[a-z]+$/, "")] : 
                        (this.urlArgs ? "?" + this.urlArgs : ""))
                , type: "GET"
                , dataType: "text"
                , success: function(text) {
                    loaderJsObj.defineQueue.queue(function() {
                        var fileData = loaderJsObj.files[path];
                        fileData.content = text;
                        // если нет зависимостей то сразу добавим файл в документ
                        if (!(fileData.pathAlias != "" && loaderJsObj.shim[fileData.pathAlias])) {
                            var defineCounter = loaderJsObj.defineCounter;
                            loaderJsObj.appendFile(path);
                            if (fileData.type == "js") {
                                // если счетчик не изменился, то значит файл не оформлен по amd
                                if (defineCounter == loaderJsObj.defineCounter) {
                                    fileData.defObj.resolve();
                                } else {
                                    var module = loaderJsObj.defineModules[defineCounter + 1];
                                    var depsHash = loaderJsObj.getDepsHash(module.deps);
                                    // файл оформлен по amd
                                    loaderJsObj.deps[depsHash].defObj.done(function(exports) {
                                        fileData.exports = module.init.apply(window, loaderJsObj.deps[depsHash].params);
                                        fileData.defObj.resolve();
                                    });
                                }
                            } else {
                                fileData.defObj.resolve();
                            }
                        } else {
                            var depsHash = loaderJsObj.getDepsHash(loaderJsObj.shim[fileData.pathAlias].deps);
                            loaderJsObj.deps[depsHash].defObj.done(function() {
                                var defineCounter = loaderJsObj.defineCounter;
                                loaderJsObj.appendFile(path);
                                // файл не должен оформлен по amd
                                if (defineCounter < loaderJsObj.defineCounter) {
                                    console.error("Файл не должен быть оформлен по amd: " + path)
                                }
                                if (fileData.type == "js") {
                                    fileData.exports = loaderJsObj.shim[fileData.pathAlias].init.apply(window, loaderJsObj.deps[depsHash].params);
                                    if (fileData.exports === undefined && typeof loaderJsObj.shim[fileData.pathAlias].exports ==  "string") {
                                        fileData.exports = loaderJsObj.getProp(window, loaderJsObj.shim[fileData.pathAlias].exports);
                                    }                                    
                                }
                                fileData.defObj.resolve();
                            });
                        }
                        loaderJsObj.defineQueue.dequeue();
                    });
                        
                        
                }
            })
        }
        , getDepsHash: function(deps) {
            var str = deps.join(" ") + " depssolt";     
            // hashCode()
            if (Array.prototype.reduce){
                return str.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);              
            } 
            var hash = 0;
            if (str.length === 0) return hash;
            for (var i = 0; i < str.length; i++) {
                var character  = str.charCodeAt(i);
                hash  = ((hash<<5)-hash)+character;
                hash = hash & hash; // Convert to 32bit integer
            }
            return hash;
        }
        , appendFile: function(path) {
            var fileData = this.files[path];
            if (fileData.type == "js") {
                if ($("#scripts-holder").length == 0) {
                    this.appendHolderForScripts();
                }          
                this.appendScript(path);
            } else if (fileData.type == "css") {
                if ($("#styles-holder").length == 0) {
                    this.appendHolderForStyles();
                }          
                this.appendStyle(path);
            } else if (fileData.type == "ftl") {
                if ($("#tmpls-holder").length == 0) {
                    this.appendHolderForTmpls();
                }          
                this.appendTmpl(path);
            }
        }
        , appendHolderForScripts: function() {
            $("<div/>").attr("id", "scripts-holder").prependTo("body");
        }
        , appendHolderForStyles: function() {
            $("<div/>").attr("id", "styles-holder").prependTo("body");
        }
        , appendHolderForTmpls: function() {
            $("<div/>").attr("id", "tmpls-holder").prependTo("body");
        }
        , appendScript: function(path) {
            var fileData = this.files[path];
            $("<script/>")
                .attr("type", "text/javascript")
                .attr("data-src", path)
                .html(fileData.content)
                .appendTo("#scripts-holder");
            delete(fileData.content);
        }
        , appendStyle: function(path) {
            var fileData = this.files[path];
            $("<style/>")
                .attr("type", "text/css")
                .attr("data-href", path)
                .html(fileData.content)
                .appendTo("#styles-holder");
            delete(fileData.content);
        }
        , appendTmpl: function(path) {
            var fileData = this.files[path];
            $("<script/>")
                .attr("type", "text/x-jquery-tmpl")
                .attr("data-src", path)
                .html(fileData.content)
                .appendTo("#tmpls-holder");
            delete(fileData.content);
        }
        , normalizeBaseUrl: function() {
            if (!this.baseUrl) {
                this.baseUrl = location.href.replace(location.pathname, "").replace(/\/$/, "") + "/";
                return;
            }
            if (!this.isFullPath(this.baseUrl)) {
                this.baseUrl = location.href.replace(location.pathname, "").replace(/\/$/, "") + "/" + this.baseUrl.replace(/^\//, "");
            }
            if (this.baseUrl.lastIndexOf("/") != this.baseUrl.length - 1) {
                this.baseUrl += "/";
            }
        }
        , normolizeConfigPaths: function() {
            for (var pathAlias in this.paths) {
                var path = this.paths[pathAlias];
                if (!path) {
                    delete(this.paths[pathAlias]);
                    continue;
                }
                var query = undefined;
                if (path.indexOf("?") != -1) {
                    query = path.substring(path.indexOf("?") + 1);
                    path = path.substring(0, path.indexOf("?"));
                    
                }                    
                path = this.normolizePath(path);
                if (query) {
                    var params = this.parseQueryString(query);
                    if (params["v"]) {
                        this.pathVersions[path.replace(/\.[a-z]+$/, "")] = params["v"];
                    }
                }
                this.paths[pathAlias] = path;
            }
        }
        , normolizePathVersions: function() {
            for (var path in this.pathVersions) {
                if (!path) {
                    delete(this.pathVersions[path]);
                    continue;
                }   
                var normpath = this.normolizePath(path);
                if (path != normpath) {
                    this.pathVersions[normpath] = this.pathVersions[path];
                    delete(this.pathVersions[path]);
                }
            }
        }
        , normolizePath: function(path) {
            if (!this.isFullPath(path)) {
                path = this.baseUrl + path.replace(/^\//, "");
            }
            path = path.replace(/\/$/, "").replace(/\.js$/, "");
            return path;
        }
        , parsePathAlias: function (pathAlias) {
            if (this.isFullPath(pathAlias)) {
                return {
                    path: pathAlias
                    , alias: ""
                    , type: (/\.[a-z]$/.test(pathAlias) ? pathAlias.substring(pathAlias.lastIndexOf(".") + 1) : "js")
                };
            }
            
            var fileExtension = "js"
                , fileFullPath = ""
            ;
            if (pathAlias.indexOf("text!") != -1) {
                pathAlias = pathAlias.substring(pathAlias.indexOf("text!") + 1);
                if (/\.[a-z]+$/.test(pathAlias)) {
                    fileExtension = pathAlias.substring(pathAlias.lastIndexOf(".") + 1);
                }
            }
            if (this.isRelativePath(pathAlias)) {
                var pathAliasParts = pathAlias.split("/");
                var path = this.paths[pathAliasParts[0]];
                if (path) {
                    pathAlias = pathAliasParts[0];
                    pathAliasParts.splice(0,1);
                    fileFullPath = path + (pathAliasParts.length > 0 ? "/" + pathAliasParts.join("/") : "") + "." + fileExtension;
                } else {
                    fileFullPath = this.normolizePath(pathAliasParts.join("/")) + "." + fileExtension;
                    pathAlias = "";
                }
            } else {
                fileFullPath = this.normolizePath(pathAlias) + "." + fileExtension;
                pathAlias = "";
            }
            return {
                path: fileFullPath
                , type: fileExtension
                , alias: pathAlias
            }
        }
        , isFullPath: function(path) {
            if (path.indexOf("http://") != -1 || path.indexOf("https://") != -1 || path.indexOf("//") == 0) {
                return true;
            }
            return false;
        }
        , isRelativePath: function(path) {
            if (this.isFullPath(path)) {
                return false;
            }
            if (path.indexOf("/") == 0) {
                return false;
            }
            return true;
        }
        , getProp: function(obj, prop) {
            if (!obj || !prop || typeof prop != "string") {
                return undefined;
            }
            var deepProps = prop.split(".");
            var outputProp;
            for (var i in deepProps) {
                outputProp = obj[deepProps[i]];
                obj = outputProp;
            }
            return outputProp;
        }
        , parseQueryString: function(query) {
            if (!query) {
                return {};
            }
            var params = {};
            if (query) {
                if (query.substr(0, 1) == '?') {
                    query = query.substr(1);
                }
                if (query == "") {
                    return {};
                }
                var queryParts = query.split("&");
                for (var i in queryParts) {
                    if (queryParts[i] == "") {
                        continue;
                    }
                    var keyValue = queryParts[i].split("=");
                    params[keyValue[0]] = decodeURIComponent(keyValue[1]);
                }
            }
            return params;
        }
    });
    return LoaderJs;
}(window, $))

