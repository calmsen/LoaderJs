LoaderJs = (function(window, $) {
    window.Exception = function (message) {
        this.message = function() {
            return message;
        };
    } 
    
    function LoaderJs() {
        this.init.apply(this, arguments);
    }
    
    $.extend(LoaderJs.prototype = new Object(), {
        defaults: {
            urlArgs: "version=1.0.0"
            , waitSeconds: 60
            , baseUrl: ""
            , paths: {
                pathAlias: "/path/to/file/without/extension"
            }
            , shim: {
                pathAlias: {deps: [], init: $.noop(), exports: ""}
            }
        }
        , files: {}
        , deps: {}
        , defineCounter: 0
        , defineExports: []
        , defineQueue: $("<a/>")
        , init: function(options) {
            $.extend(true, this, this.defaults, options);
            this.normalizeBaseUrl();
            try {
                this.normolizeConfigPaths();
            } catch (ex) {
                console.error(ex.message());
                return;
            }
            this.makeCompatibleWithRequireJs();
        }
        , makeCompatibleWithRequireJs: function() {
            var loaderJsObj = this;
            window.require = window.requirejs = function(deps, callback) {
                loaderJsObj.require(deps, callback);
            };
            window.define = function(moduleName, deps, init) {
                loaderJsObj.define(moduleName, deps, init);
            };
            window.require.config = function(options) {
                loaderJsObj.init(options);
            };
        }
        , require: function(deps, callback, requireData) {
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
                        this.require(this.shim[pathData.alias].deps || [], this.shim[pathData.alias].init || $.noop, {path: pathData.path});
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
            if (requireData === undefined) {
                this.deps[depsHash].defObj.done(function() {
                    callback.apply(window, loaderJsObj.deps[depsHash].params);
                });
            } else {
                if (requireData.defineCounter !== undefined) {
                    this.defineExports[requireData.defineCounter] = $.Deferred();
                    this.deps[depsHash].defObj.done(function() {
                        var exports = callback.apply(window, loaderJsObj.deps[depsHash].params);
                        loaderJsObj.defineExports[requireData.defineCounter].resolve(exports);
                    });
                } else if (requireData.path!== undefined) {
                    // Вызовем в методе loadFile 
//                    var fileData = loaderJsObj.files[requireData.path];
//                    if (fileData.type == "js") {
//                        fileData.defObj.done(function() {
//                           fileData.exports = callback.apply(window, loaderJsObj.deps[depsHash].params);
//                            if (fileData.exports === undefined && typeof loaderJsObj.shim[fileData.pathAlias].exports ==  "string") {
//                                fileData.exports = loaderJsObj.getProp(window, loaderJsObj.shim[fileData.pathAlias].exports);
//                            } 
//                        });                                    
//                    }
                }
            }
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
            this.require(deps, init, {defineCounter: this.defineCounter});
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
        , loadFile: function(path) {
            var loaderJsObj = this;
            $.ajax({
                url: path
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
                                    // файл оформлен по amd
                                    loaderJsObj.defineExports[defineCounter + 1].done(function(exports) {
                                        fileData.exports = exports;
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
                if (this.isRelativePath(this.baseUrl)) {
                    this.baseUrl = location.href.replace(/\/$/, "") + "/" + this.baseUrl;
                } else {
                    this.baseUrl = location.href.replace(location.pathname, "").replace(/\/$/, "") + "/" + this.baseUrl;
                }
            }
            if (this.baseUrl.lastIndexOf("/") != this.baseUrl.length - 1) {
                this.baseUrl += "/";
            }
        }
        , normolizeConfigPaths: function() {
            for (var pathAlias in this.paths) {
                if (!this.paths[pathAlias]) {
                    delete(this.paths[pathAlias]);
                    continue;
                }
                this.paths[pathAlias] = this.normolizePath(this.paths[pathAlias]);
                // запретим указывать разрешения во избежания путаниц при формировнии полных путей
                if (/\.js$/.test(this.paths[pathAlias])) {
                    throw new Exception("Нельзя указывать разрешения в файлах.");
                }
            }
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
                if (/\.[a-z]$/.test(pathAlias)) {
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
        , normolizePath: function(path) {
            if (!this.isFullPath(path)) {
                if (this.isRelativePath(path)) {
                    path = this.baseUrl + path;
                } else {
                    path = this.baseUrl + path.replace(/^\//, "");
                }
            }
            path = path.replace(/\/$/, "");
            return path;
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
    });
    return LoaderJs;
}(window, $))
new LoaderJs();

