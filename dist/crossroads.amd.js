/*!!
 * Crossroads - JavaScript Routes
 * Released under the MIT license <http://www.opensource.org/licenses/mit-license.php>
 * @author Miller Medeiros
 * @version 0.2
 * @build 15 (04/14/2011 04:10 AM)
 */
define(['js-signals'], function(signals){
		
	var crossroads, 
		patternLexer, 
		_toString = Object.prototype.toString;
	
	// Helpers -----------
	//====================
	
	function arrayIndexOf(arr, val){
		var n = arr.length;
		//Array.indexOf doesn't work on IE 6-7
		while(n--){
			if(arr[n] === val) return n;
		}
		return -1;
	}
	
	function toString(obj){
		return _toString.call(obj);
	}
			
	// Crossroads --------
	//====================
	
	crossroads = (function(){
		
		var _routes = [],
			_bypassed = new signals.Signal();
		
		function addRoute(pattern, callback, priority){
			var route = new Route(pattern, callback, priority);
			sortedInsert(route);
			return route;
		}
		
		function sortedInsert(route){
			//simplified insertion sort
			var n = getNumRoutes();
			do { --n; } while (_routes[n] && route._priority <= _routes[n]._priority);
			_routes.splice(n+1, 0, route);
		}
		
		function getNumRoutes(){
			return _routes.length;
		}
		
		function removeRoute(route){
			var i = getRouteIndex(route);
			if(i >= 0) _routes.splice(i, 1);
			route._destroy();
		}
		
		function getRouteIndex(route){
			return arrayIndexOf(_routes, route);
		}
		
		function removeAllRoutes(){
			var n = getNumRoutes();
			while(n--){
				_routes[n]._destroy();
			}
			_routes.length = 0;
		}
		
		function parse(request){
			request = request || '';
			var route = getMatchedRoute(request),
				params = route? getParamValues(request, route) : null;
			if(route){ 
				params? route.matched.dispatch.apply(route.matched, params) : route.matched.dispatch();
			}else{
				_bypassed.dispatch(request);
			}
		}
		
		function getMatchedRoute(request){
			var i = getNumRoutes(), route;
			while(route = _routes[--i]){ //should be decrement loop since higher priorities are added at the end of array  
				if(route.match(request)) return route;
			}
			return null;
		}
		
		function getParamValues(request, route){
			return patternLexer.getParamValues(request, route._matchRegexp);
		}
		
		//API
		return {
			_routes : _routes,
			addRoute : addRoute,
			removeRoute : removeRoute,
			removeAllRoutes : removeAllRoutes,
			parse : parse,
			bypassed : _bypassed,
			getNumRoutes : getNumRoutes,
			toString : function(){
				return '[crossroads numRoutes:'+ getNumRoutes() +']';
			}
		};
		
	}());
	
			
	// Route --------------
	//=====================
	
	function Route(pattern, callback, priority){
		this._pattern = pattern; //maybe delete, used only for debug
		this._paramsId = patternLexer.getParamIds(pattern);
		this._matchRegexp = patternLexer.compilePattern(pattern);
		this.matched = new signals.Signal();
		if(callback) this.matched.add(callback);
		this._priority = priority || 0;
	}
	
	Route.prototype = {
		
		rules : void(0),
		
		match : function(request){
			return this._matchRegexp.test(request) && validateParams(this, request);
		},
		
		dispose : function(){
			crossroads.removeRoute(this);
		},
		
		_destroy : function(){
			this.matched.dispose();
			this.matched = this._pattern = this._paramsId = this._matchRegexp = null;
		},
		
		toString : function(){
			return '[Route pattern:"'+ this._pattern +'", numListeners:'+ this.matched.getNumListeners() +']';
		}
		
	};
	
	function validateParams(route, request){
		var rules = route.rules,
			values = rules? getValuesObject(route, request) : null,
			prop;
		for(prop in rules){
			if(rules.hasOwnProperty(prop)){ //filter prototype
				if(! validateRule(rules[prop], values[prop], values, request) ) return false;
			}
		}
		return true;
	}
	
	function validateRule(rule, val, values, request){
		switch(toString(rule)){
			case '[object RegExp]':
				return rule.test(val);
			case '[object Array]':
				return arrayIndexOf(rule, val) !== -1;
			case '[object Function]':
				return rule(val, request, values);
			default:
				return false; //not sure if it should throw an error or just fail silently...
		}
	}
	
	function getValuesObject(route, request){
		var ids = route._paramsId,
			values = patternLexer.getParamValues(request, route._matchRegexp),
			o = {}, 
			n = ids.length;
		while(n--){
			o[ids[n]] = values[n];
		}
		return o;
	}
	
	
	// Pattern Lexer ------
	//=====================
	
	patternLexer = crossroads.patternLexer = (function(){

		var ESCAPE_CHARS_REGEXP = /[\\\.\+\*\?\^\$\[\]\(\)\{\}\/\'\#]/g,
			SEGMENT_REGEXP = /([^\/]+)/,
			PARAMS_REGEXP = /\{([^\}]+)\}/g,
			SAVE_PARAMS = '___CR_PARAM___',
			SAVED_PARAM_REGEXP = new RegExp(SAVE_PARAMS, 'g');
		
		function getParamIds(pattern){
			var ids = [], match;
			while(match = PARAMS_REGEXP.exec(pattern)){
				ids.push(match[1]);
			}
			return ids;
		}
	
		function compilePattern(pattern){
			pattern = pattern? saveParams(pattern) : '';
			pattern = escapePattern(pattern); //make sure chars that need to be escaped are properly converted
			pattern = convertSavedParams(pattern);
			return new RegExp('^'+ pattern + '$');
		}
		
		function saveParams(pattern){
			return pattern.replace(PARAMS_REGEXP, SAVE_PARAMS);
		}
		
		function convertSavedParams(pattern){
			return pattern.replace(SAVED_PARAM_REGEXP, SEGMENT_REGEXP.source);
		}
		
		function escapePattern(pattern){
			return pattern.replace(ESCAPE_CHARS_REGEXP, '\\$&');
		}
		
		function getParamValues(request, regexp){
			var vals = regexp.exec(request);
			if(vals){
				vals.shift();
				vals = typecastValues(vals);
			}
			return vals;
		}
		
		function typecastValues(values){
			var n = values.length, 
				result = [],
				val;
			while(val = values[--n]){
				result[n] = (val === null || val === '' || isNaN(val))? val : parseFloat(val); //parseFloat(null || '') returns NaN
			}
			return result;
		}
		
		//API
		return {
			getParamIds : getParamIds,
			getParamValues : getParamValues,
			compilePattern : compilePattern
		};
	
	}());
	
	return crossroads;
	
});