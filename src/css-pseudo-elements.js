/*!
Copyright (C) 2012 Adobe Systems, Incorporated. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

!function(scope){		   
	   
	scope = scope || window

	if (!scope.CSSParser){
		throw new Error("Missing CSS Parser")
	}
	
	var _parser = new CSSParser(),												   
	    _config = {
			styleType: "text/experimental-css",
			pseudoPositions: "before after letter line".split(" "),
			regex: {
                nthPseudoElementSelector: /((?:nth-(?:last-)?)pseudo)\s*\(\s*([^\'\"]\w+)\s*,\s*([\d\w\+\-]+)\s*\)/i,
    			pseudoElementSelector: /^(before|after)(?:\[(\d+)\])?$/i 
			}
		}
		
		
	scope.getPseudoElements = function(element, position){
	    var pseudos 
	    
		if (!element || element.nodeType !== 1){
			throw new Error("Invalid parameter 'element'. Expected DOM Node type 1")
		}

		if (typeof position !== 'string' || _config.pseudoPositions.indexOf(position) < 0){
			throw new TypeError("Invalid parameter 'position'. Expected one of " + _config.pseudoPositions)
		}    
		
		if (!element.pseudoElements){
		    pseudos = []
		}                  
		
        pseudos = element.pseudoElements.filter(function(pseudo){
             return pseudo.position === position
         })                                  
         
		return new CSSPseudoElementList(pseudos)
	} 
	
	/*
		Create a CSSPseudoElement object.
		
		@param {Integer} ordinal The oridinal of the pseudo-element shoud be a positive integer
		@param {String} type The type of the pseudo-element should be one of: "before","after","letter" or "line"
		@param {Object} style The CSS style properties of the pseudo-element
	*/	  
	function CSSPseudoElement(ordinal, type, style){
		var cssText = []     
				
        // pseudos need to have either content of flow-from		
        if (!style['content'] && !style['-webkit-flow-from']){
            return
        }
		
		// create the mock pseudo-element as a real element
		var mock = document.createElement("span")
		mock.setAttribute("data-pseudo-element","")
		mock.setAttribute("data-ordinal", ordinal)
		mock.setAttribute("data-type", type)
		                    
		if (style['content']){                 
			mock.textContent = style['content']
		}  
		
		for (var key in style){
			cssText.push(key + ":" + style[key])
		}			  
		
		mock.setAttribute("style", cssText.join(";") )
		 
		this.ordinal = ordinal
		this.type = type
		this.style = style 
		this.src = mock
		
        return this
	}
	
	function CSSPseudoElementList(pseudos){
	    var self = this 
	    
	    pseudos.forEach(function(pseudo, index){  
	        self[index] = pseudos[index]        
	    })
	    
	    this.length = pseudos.length      
	} 
	
    CSSPseudoElementList.prototype.item = function(index){
        return this[index] || null
    }                             
    
    CSSPseudoElementList.prototype.getByOrdinalAndPosition = function(ordinal, position){
        var match = Array.prototype.filter.call(this, function(pseudo){
            return pseudo.ordinal === ordinal && pseudo.position === position
        }) 
    
        return match.length ? match.pop() : null
    }
    
    function NthPseudoElementCSSRule(cssRule){
        var data, 
            parts = cssRule.selectorText.split("::")
            
 	    this.hostSelectorText = parts[0]     

        /* 
            Attempt to extract the nth-pseudo index and type
            data[1] = pseudo-element selector, should be one of:
                nth-pseudo
                nth-last-pseudo                              

            data[2] = type, should be one of:
                before
                after
                letter
                line
                
            data[3] = index, should be one of:
                positive integer
                odd
                even
                an+b formula
            
        */            
        data = parts[1].match(_config.regex.nthPseudoElementSelector)
        
        if (data && data.length == 4){
            
            // import all the CSSRule properties
            for (var key in cssRule){
                this[key] = cssRule[key]
            } 
                            
            this.pseudoSelectorType = data[1]
            
            // make sure the type is valid
            this.type = (_config.pseudoPositions.indexOf(data[2]) > -1) ? data[2] : null
            
            this.index = data[3] 
            this.queryFn = getIndexQueryFunction(this.index)
        }    
    }
	
	function PseudoElementCSSRule(cssRule){
		var data, 
			parts = cssRule.selectorText.split("::")

 	    this.hostSelectorText = parts[0] 

 	    /*
 	        Match pseudo-element selectors
 	        data[1] -> type: before | after
 	        data[2] -> ordinal
 	    */
		data = parts[1].match(_config.regex.pseudoElementSelector)

		if (data && data[1]){
		    
		    // Convert native CSSStyleRule to CSSRule.
            // Native pseudo-elements come across as CSSStyleRule
            if (cssRule instanceof CSSStyleRule && typeof cssRule.cssText == 'string'){
                cssRule = _parser.parseCSSDeclaration(cssRule.cssText)
            }     
            
            // import all the CSSRule properties
            for (var key in cssRule){
                this[key] = cssRule[key]
            }   
                 
            this.pseudoSelectorType = "pseudo-element"

            // Native pseudo-elements don't have an ordinal. Default to ordinal = 1
    		this.ordinal = data[2] ? parseInt(data[2], 10) : 1
            this.type = data[1]

    		// Rewrite the selector text to make it uniform across all pseudo-element rules
            // Necessary when doing CSS cascade and comparison
    		this.setSelector([this.hostSelectorText, "::", this.type , "[", this.ordinal, "]"].join(''))
		}
	}
	
	function getIndexQueryFunction(query){
	    
	    var queryFn = function(){}
	    
	    /*
    		Returns a query function from the formula provided.

    		@param {String} formula The formula to convert to a function.
    								Formula must follow an+b form
    		@see: http://www.w3.org/TR/css3-selectors/#nth-child-pseudo 
    		@return {Function}
    	*/
    	function getQueryFunction(formula){
    		var temp,
    			pattern = /(\d+)?(n)(?:([\+-])(\d+))?/,
    			parts = formula.match(pattern),
    			multiplier = parseInt(parts[1], 10) || 1,
    			operation = parts[3] || "+",
    			modifier = parseInt(parts[4], 10) || 0 

    		// TODO: test the hell out this!			
    		return function(index){
    		   temp = multiplier * index 

    		   if (operation == "-"){
    		       return temp - modifier
    		   }
    		   else{
    		       return temp + modifier
    		   }
    		}	 
    	} 
    	
	    if (/^\d+$/.test(query) ){
			
			queryFn = function(ordinal){
				return function(index){
					if (index == ordinal){    
					    return index
					} 
				}
			}(parseInt(query, 10)) 
			
		}
		else if(/\d+?n?(\+\d+)?/.test(query)){  
			queryFn = getQueryFunction(query) 
		} 
		else {
			if (query === "odd"){	   
				queryFn = getQueryFunction("2n+1")
			}
			else if(query === "even"){             
				queryFn = getQueryFunction("2n") 
			}
			else{
				throw new Error("Invalid pseudo-element index: " + query + ". Expected one of: an+b, odd, even")			  
			}
		}
		
		return queryFn
	}
									  
	/*
		Create pseudo-elements out of potential CSS Rules.		 
		
		Check that the host of the pseudo-element exists.
		Check that the's only one pseudo element in the selector.
		Create CSSPseudoElement objects and attach them to the host.
		
		@param {Array} cssRules List of potential selectors to create pseudo-elements
	*/
	function createPseudoElements(cssRules){ 
	    var groups, host, position
	        
	    // group rules by hostSelectorText
	    // TODO: remvoe this step and merge with nth-pseudo grouping
	    groups = groupByHostSelector(cssRules) 
	    
	    for (host in groups){              
	        for (position in groups[host]){

	            // create and attach pseudo-elements
	            groups[host][position].forEach(createPseudoElement)
	        }
	    }
	}
	
	/*
	    Create pseudo-elements and attach them to the corresponding host element.
	    @param {PseudoElementCSSRule} rule The rule according to which to create the pseudo-element
	*/
	function createPseudoElement(rule){     
	    
	    var pseudoElement,
	        hosts = document.querySelectorAll(rule.hostSelectorText)
			 	
		Array.prototype.forEach.call(hosts, function(host){
		    pseudoElement = new CSSPseudoElement(rule.ordinal, rule.type, rule.style)
		    
		    // become parasitic. 
    		// Attach pseudo elements objects to the host node
    		host.pseudoElements = host.pseudoElements || [] 
    		host.pseudoElements.push(pseudoElement)	 

    		switch(pseudoElement.type){
    			case "before":
    				if (host.firstChild){
    					host.insertBefore(pseudoElement.src, host.firstChild)
    				}														
    				else{
    					host.appendChild(pseudoElement.src)
    				}					 
    			break

    			case "after":							   
    				host.appendChild(pseudoElement.src)
    			break
    		}
		})	
	}
	
	/*
	    Group an array of PseudoElementCSSRule items into separate arrays by their hostSelectorText and type
	    Sort rules by ordinal
	    
	    @param {Array} cssRules Array of PseudoElementCSSRule items
	    @return {Object} key/value store
	        @key = {String} hostSelectorText
	        @value = {Array} array of PseudoElementCSSRule 
	*/
	function groupByHostSelector(cssRules){
	    var groups = {}, host, type     
	    
	    cssRules.forEach(function(rule){ 
	        
		    if (!groups[rule.hostSelectorText]){
		        groups[rule.hostSelectorText] = {
		            "before": [],
		            "after": []
		        }
            }    
		     
            groups[rule.hostSelectorText][rule.type].push(rule)
        })
        
        for (host in groups){              
	        for (type in groups[host]){
	            /* 
	                Sort the CSSRules ascending by their 'ordinal' property
	                This helps maintain correct rendering order from the host boundaries 
	                when appending / prepending based on 'type' property

	                    before -> preprend: [3,2,1]BOX
	                    after -> append: BOX[1,2,3]
                */
	            groups[host][type].sort(function(a, b){
                    return a.ordinal - b.ordinal
                })
	        }
	    } 
	    
	    return groups
	}
	
	/*
		Filter rules and return likely pseudo-element rules.
		Concatenate results with native pseudo-element rules found in the document stylesheets.
		
		@param {Array} rules Array of CSSRule instances
		@return {Array} filtered array concatenated with native pseudo-element rules
		
	*/
	function collectPseudoRules(allRules){ 
	    var parts,
	        pseudoRules = []
	    
	    pseudoRules = allRules.filter(function(rule){ 
    		parts = rule.selectorText.split("::")

    		// valid rules have only two parts, host and pseudo-element
			return (parts && parts.length === 2)
		}) 
		
		Array.prototype.forEach.call(document.styleSheets, function(sheet){      
		    var ruleIndexToDelete = []
		    
		    Array.prototype.forEach.call(sheet.cssRules, function(rule, index){
		        
    		    if (rule.selectorText.indexOf("::") > 0){   
                                       
                    // add to the start of the array to be overwritten by experimental styles on CSS Cascade    
                    pseudoRules.unshift(rule)
                    
                    // prepare to delete the original rule so it won't apply anymore
                    ruleIndexToDelete.push(index)
    		    }
    		})             

    		// reversing array in order to delete from the end
    		ruleIndexToDelete.reverse().forEach(function(ruleIndex){
                sheet.removeRule(ruleIndex)
    		})
		}) 
		
		return pseudoRules
	}
	    
	
	function processNthPseudoElementRules(pseudoRules, nthRules){
		
		// TODO: make grouping a single operation,
		// group rules by hostSelectorText
	    var groups = groupByHostSelector(pseudoRules)
	    
	    nthRules.forEach(function(nthRule){    
	        
            if (groups[nthRule.hostSelectorText]){
                
                // get all potential pseudo-element rules that might be matched by this nth-pseudo-rule
                var potentialRules = groups[nthRule.hostSelectorText][nthRule.type]
                
                var matchedRules = matchNthPseudoElementRule(potentialRules, nthRule)

                matchedRules.forEach(function(rule){
                    // augment matching rule with CSS properties from the nth-pseudo rule
                    rule.style = _parser.doExtend({}, rule.style, nthRule.style)
                })        

                // CSS Cascade will apply later on
                pseudoRules = pseudoRules.concat(matchedRules)  
            }
	    })   

		return pseudoRules
	}
	    
	/*       
	    Find ::pseudo-element rules that match the given ::nth-pseudo or ::nth-last-pseudo rule
	    The nth-pseudo can match:
	        a specific index (not ordinal)
	        odd indexes
	        even index, or 
	        indexes which satisfy an 'an+b' formula
	        
	    @note CSS indexes start from 1. JavaScript indexes start from 0.
	    
	    @param {Array} pseudoRules Array of PseudoElementCSSRule instances
	    @param {PseudoElementCSSRule} nthRule The rule to match against.
	    
	    @return {Array} array of matching rules 
	*/
	function matchNthPseudoElementRule(pseudoRules, nthRule){
        var matchedRules = []
        
        pseudoRules.forEach(function(rule, index){ 
            
            var match,             
                // expecting 1-indexed array in CSS an+b formula
                pos = nthRule.queryFn(index + 1),
                maxIndex = pseudoRules.length - 1
            
            // JS arrays are 0-indexed
            pos = pos - 1
            
            switch (nthRule.pseudoSelectorType){
                case "nth-pseudo":   
                    match = pseudoRules[pos] 
                break
                
                case "nth-last-pseudo": 
                    // matching from the end
                    match = pseudoRules[maxIndex - pos] 
                break
            }            
            
            if (match){                                    
                matchedRules.push(match)
            }        
        })
        
        return matchedRules
	}
	
	function init(){ 
		var cssRules = [], 
			pseudoRules = [],
			nthRules = [],
			experimentalStyleSheets = document.querySelectorAll('style[type="'+ _config.styleType +'"]')

		if (!experimentalStyleSheets || !experimentalStyleSheets.length){ 
			console.warn("No stylesheets found. Expected at least one stylesheet with type = "+ _config.styleType)
			return
		}		
	   
	    // collect rules from experimental stylesheets
		Array.prototype.forEach.call(experimentalStyleSheets, function(sheet){
			_parser.parse(sheet.textContent)
		})	 
		
        // cascade CSS rules where required
        _parser.cascade()

		// quick filter of rules with pseudo-element selectors refences.
		// includes ::before, ::after, nth-psuedo and ::nth-last-pseudo
		cssRules = collectPseudoRules(_parser.cssRules)
												
		if (!cssRules.length){
			console.warn("No pseudo-element rules")
			return
		}   
		
		pseudoRules = cssRules.reduce(function(memo, rule){ 
		    var pseudoRule = new PseudoElementCSSRule(rule)
		    if (pseudoRule.type){
		        memo.push(pseudoRule)
		    }                     
		    return memo
		}, []) 

        pseudoRules = _parser.cascade(pseudoRules) 		
		
		nthRules = cssRules.reduce(function(memo, rule){
		    var nthRule = new NthPseudoElementCSSRule(rule)
		    if (nthRule.type){
		        memo.push(nthRule)
		    }
		    return memo
		}, []) 
		
		if (nthRules.length){
		    nthRules = _parser.cascade(nthRules)   
            
            // match rules by nth-pseudo and generate rules to overwrite them accordingly
            pseudoRules = processNthPseudoElementRules(pseudoRules, nthRules)

            // cascade prototype pseudo-element rules generated by nth-pseudo processing
            pseudoRules = _parser.cascade(pseudoRules)
		}
		                                                                            
        createPseudoElements(pseudoRules)
	}
	
	scope.CSSPseudoElementList = CSSPseudoElementList
	scope.CSSPseudoElement = CSSPseudoElement
	
	scope.CSSPseudoElementsPolyfill = (function(){
		return {
			init: init,
			getIndexQueryFunction: getIndexQueryFunction
		}
	})()
	
	document.addEventListener("DOMContentLoaded", init)
	
}(window)