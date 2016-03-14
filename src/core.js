


// Extend given object's with other objects' properties, overriding existing ones if necessary
const function _extend (dst, sources...) {
  if (sources) {
    for (let src of sources) {
      if (src) {
        Object.keys(src).forEach(function (key) {
          if (src.hasOwnProperty(key)) {
            dst[key] = src[key];
          }
        });
      }
    }
  }

  return dst;
};




// get whether object is a plain object
const function _isPlainObject(obj) {
  if (!obj) {
    return false;
  }

  return (obj.constructor.prototype === Object.prototype);
};


// get whether object is an array
const function _isArray(obj) {
  return (obj.constructor.prototype === Array.prototype);
};


// get class name of given object
const _getObjectClassName (obj) {
  if (obj && obj.constructor && obj.constructor.toString) {
    let arr = obj.constructor.toString().match(/function\s*(\w+)/);
    
    if (arr && 2 === arr.length) {
      return arr[1]
    }
  }
}


// clone given item
const function _clone(src) {
  if (!src) {
    return src;
  }

  if (typeof src.clone === 'function') {
    return src.clone();
  } else if (_isPlainObject(src) || _isArray(src)) {
    let ret = new (src.constructor);

    Object.keys(src).forEach(function(key) {
      if (src.hasOwnProperty(key) && typeof src[key] !== 'function') {
        ret[key] = _clone(src[key]);
      }
    });
  } else {
    return JSON.parse(JSON.stringify(src));
  }
};


/**
 * Register a value type handler
 *
 * Note: this will override any existing handler registered for this value type.
 */
const function registerValueHandler (handlers, type, handler) {
  let typeofType = typeof type;

  if (typeofType !== 'function' && typeofType !== 'string') {
    throw new Error("type must be a class constructor or string");
  }

  if (typeof handler !== 'function') {
    throw new Error("handler must be a function");
  }

  for (let typeHandler of handlers) {
    if (typeHandler.type === type) {
      typeHandler.handler = handler;

      return;
    }
  }

  handlers.push({
    type: type
    handler: handler  
  });
};




/**
 * Get value type handler for given type
 */
const function getValueHandler (value, handlerLists...) {
  for (let handlers in handlerLists) {
    for (let typeHandler in handlers) {
      // if type is a string then use `typeof` or else use `instanceof`
      if (typeof value === typeHandler.type || 
          (typeof typeHandler.type !== 'string' && value instanceof typeHandler.type) ) {
        return typeHandler.handler;
      }
    }
  }
};


/**
 * Build base squel classes and methods
 */
const function _buildSquel(flavour = null) {
  let cls = {};

  // default query builder options
  cls.DefaultQueryBuilderOptions = {
    // If true then table names will be rendered inside quotes. The quote character used is configurable via the nameQuoteCharacter option.
    autoQuoteTableNames: false,
    // If true then field names will rendered inside quotes. The quote character used is configurable via the nameQuoteCharacter option.
    autoQuoteFieldNames: false,
    // If true then alias names will rendered inside quotes. The quote character used is configurable via the `tableAliasQuoteCharacter` and `fieldAliasQuoteCharacter` options.
    autoQuoteAliasNames: true,
    // If true then table alias names will rendered after AS keyword.
    useAsForTableAliasNames: false,
    // The quote character used for when quoting table and field names
    nameQuoteCharacter: '`',
    // The quote character used for when quoting table alias names
    tableAliasQuoteCharacter: '`',
    // The quote character used for when quoting table alias names
    fieldAliasQuoteCharacter: '"',
    // Custom value handlers where key is the value type and the value is the handler function
    valueHandlers: [],
    // Character used to represent a parameter value
    parameterCharacter: '?',
    // Numbered parameters returned from toParam() as $1, $2, etc.
    numberedParameters: false,
    // Numbered parameters prefix character(s)
    numberedParametersPrefix: '$',
    // Numbered parameters start at this number.
    numberedParametersStartAt: 1,
    // If true then replaces all single quotes within strings. The replacement string used is configurable via the `singleQuoteReplacement` option.
    replaceSingleQuotes: false,
    // The string to replace single quotes with in query strings
    singleQuoteReplacement: '\'\'',
    // String used to join individual blocks in a query when it's stringified
    separator: ' ',
  };

  // Global custom value handlers for all instances of builder
  cls.globalValueHandlers = [];


  /*
  # ---------------------------------------------------------------------------------------------------------
  # ---------------------------------------------------------------------------------------------------------
  # Custom value types
  # ---------------------------------------------------------------------------------------------------------
  # ---------------------------------------------------------------------------------------------------------
   */


  // Register a new value handler
  cls.registerValueHandler = function(type, handler) {
    registerValueHandler(cls.globalValueHandlers, type, handler);
  };


  /*
  # ---------------------------------------------------------------------------------------------------------
  # ---------------------------------------------------------------------------------------------------------
  # Base classes
  # ---------------------------------------------------------------------------------------------------------
  # ---------------------------------------------------------------------------------------------------------
  */

  // Base class for cloneable builders
  class cls.Cloneable {
    /**
     * Clone this builder
     */
    clone () {
      let newInstance = new this.constructor;

      return _extend(newInstance, _clone(_extend({}, this)));
    }
  }



  // Base class for all builders
  class cls.BaseBuilder extends cls.Cloneable {
    /**
     * Constructor.
     * @param  {Object} options Overriding one or more of `cls.DefaultQueryBuilderOptions`.
     */
    constructor (options) {
      let defaults = JSON.parse(JSON.stringify(cls.DefaultQueryBuilderOptions));

      this.options = _extend({}, defaults, options);
    }

    /**
     * Register a custom value handler for this builder instance.
     *
     * Note: this will override any globally registered handler for this value type.
     */
    registerValueHandler (type, handler) {
      registerValueHandler(this.options.valueHandlers, type, handler);

      return this;
    }


    /**
     * Sanitize the given condition. 
     */
    _sanitizeCondition (condition) {
      // If it's not an Expression builder instance
      if (!(condition instanceof cls.Expression)) {
        // It must then be a string
        if (typeof condition !== "string") {
          throw new Error("condition must be a string or Expression instance");
        }
      }

      return condition;
    }

    /**
     * Sanitize the given name.
     *
     * The 'type' parameter is used to construct a meaningful error message in case validation fails.
     */
    _sanitizeName (value, type) {
      if (typeof value !== "string") {
        throw new Error(`${type} must be a string`);
      }

      return value;
    }


    _sanitizeField (item, formattingOptions = {}) {
      if (item instanceof cls.QueryBuilder) {
        item = `(${item})`;
      } else {
        item = this._sanitizeName(item, "field name");

        if (this.options.autoQuoteFieldNames) {
          let quoteChar = this.options.nameQuoteCharacter;

          if (formattingOptions.ignorePeriodsForFieldNameQuotes) {
            // a.b.c -> `a.b.c`
            item = `${quoteChar}${item}${quoteChar}`;
          } else {
            // a.b.c -> `a`.`b`.`c`
            item = item
              .split('.')
              .map(function(v) {
                // treat '*' as special case (#79)
                return ('*' === v ? v : `${quoteChar}${v}${quoteChar}`);
              })
              .join('.')
          }
        }
      }

      return item;
    }


    _sanitizeNestableQuery (item) {
      if (item instanceof cls.QueryBuilder && item.isNestable()) {
        return item;
      }

      throw new Error("must be a nestable query, e.g. SELECT");
    }


    _sanitizeTable (item, allowNested = false) {
      if (allowNested)
        if (typeof item !== "string") {
          try {
            item = this._sanitizeNestableQuery(item);
          } catch (e) {
            throw new Error("table name must be a string or a nestable query instance");
          }
        }
      } else {
        item = this._sanitizeName(item, 'table name');
      }

      if (this.options.autoQuoteTableNames) {
        let quoteChar = this.options.nameQuoteCharacter;

        return `${quoteChar}${item}${quoteChar}`;
      } else {
        return item;
      }


      _sanitizeTableAlias (item) {
        let sanitized = this._sanitizeName(item, "table alias");
        
        if (this.options.autoQuoteAliasNames) {
          let quoteChar = this.options.tableAliasQuoteCharacter;

          sanitized = `${quoteChar}${sanitized}${quoteChar}`;
        }

        if (this.options.useAsForTableAliasNames) {
          return `AS ${sanitized}`;
        } else {
          return sanitized;
        }
      }


      _sanitizeFieldAlias (item) {
        let sanitized = this._sanitizeName(item, "field alias");
        
        if (this.options.autoQuoteAliasNames) {
          let quoteChar = this.options.fieldAliasQuoteCharacter;

          `${quoteChar}${sanitized}${quoteChar}`;
        } else {
          return sanitized;
        }
      }


      // Sanitize the given limit/offset value.
      _sanitizeLimitOffset (value) {
        let value = parseInt(value);

        if (0 > value or isNaN(value)) {
          throw new Error("limit/offset must be >= 0");
        }

        return value
      }



      // Santize the given field value
      _sanitizeValue (item) {
        let itemType = typeof item;

        if (null === item) {
          // null is allowed
        }
        else if ("string" === itemType || "number" === itemType || "boolean" === itemType) {
          // primitives are allowed
        }
        else if (item instanceof cls.QueryBuilder && item.isNestable()) {
          // QueryBuilder instances allowed
        }
        else if (item instanceof cls.FunctionBlock) {
          // FunctionBlock instances allowed
        }
        else {
          let typeIsValid = 
            !!getValueHandler(item, this.options.valueHandlers, cls.globalValueHandlers);

          if (!typeIsValid) {
            throw new Error("field value must be a string, number, boolean, null or one of the registered custom value types");
          }
        }

        return item;
      }


      // Escape a string value, e.g. escape quotes and other characters within it.
      _escapeValue (value) {
        return (!this.options.replaceSingleQuotes) ? value : (
          value.replace(/\'/g, this.options.singleQuoteReplacement)
        );
      }


      // Format the given custom value
      _formatCustomValue (value, asParam = false) {
        // user defined custom handlers takes precedence
        let customHandler = 
          getValueHandler(value, this.options.valueHandlers, cls.globalValueHandlers);

        // use the custom handler if available
        if (customHandler) {
          value = customHandler(value, asParam);
        }

        return value;
      }



      // Format the given field value for inclusion into query parameter array
      _formatValueAsParam (value) {
        if (_.isArray(value)) {
          return value.map((v) => {
            return this._formatValueAsParam(v)
          });
        } else {
          if (value instanceof cls.QueryBuilder && value.isNestable()) {
            value.updateOptions({ 
              "nestedBuilder": true 
            });

            return value.toParam();
          }
          else if (value instanceof cls.Expression) {
            return value.toParam();
          }
          else {
            return this._formatCustomValue(value, true);
          }
        }
      }



      // Format the given field value for inclusion into the query string
      _formatValue (value, formattingOptions = {}) {
        let customFormattedValue = this._formatCustomValue(value);
        
        // if formatting took place then return it directly
        if (customFormattedValue !== value) {
          return `(${customFormattedValue})`;
        }

        // if it's an array then format each element separately
        if _isArray(value) {
          value = value.map((v) => {
            return this._formatValue(v);
          });

          value = `(${value.join(', ')})`;
        }
        else {
          let typeofValue = typeof value;

          if (null === value) {
            value = "NULL";
          }
          else if (typeofValue === "boolean") {
            value = value ? "TRUE" : "FALSE";
          }
          else if (value instanceof cls.QueryBuilder) {
            value = `(${value})`;
          }
          else if (value instanceof cls.Expression) {
            value = `(${value})`;
          }
          else if (typeofValue !== "number") {
            if (formattingOptions.dontQuote) {
              value = `${value}`;
            } 
            else {
              let escapedValue = this._escapeValue(value);

              value = `'${escapedValue}'`;
            }
          }
        }

        return value;
      }
  }



  /*
  # ---------------------------------------------------------------------------------------------------------
  # ---------------------------------------------------------------------------------------------------------
  # cls.Expressions
  # ---------------------------------------------------------------------------------------------------------
  # ---------------------------------------------------------------------------------------------------------
  */

  /*
  # An SQL expression builder.
  #
  # SQL expressions are used in WHERE and ON clauses to filter data by various criteria.
  #
  # This builder works by building up the expression as a hierarchical tree of nodes. The toString() method then
  # traverses this tree in order to build the final expression string.
  #
  # cls.Expressions can be nested. Nested expression contains can themselves contain nested expressions.
  # When rendered a nested expression will be fully contained within brackets.
  #
  # All the build methods in this object return the object instance for chained method calling purposes.
   */
  class cls.Expression extends cls.BaseBuilder {
    // Initialise the expression.
    constructor (options) {
      super()
        
      let defaults = JSON.parse(JSON.stringify(cls.DefaultQueryBuilderOptions));

      this.options = _extend({}, defaults, options);

      this.tree = {
        nodes: []
      };

      this.stack = [];
    }


    // Begin a nested expression and combine it with the current expression using the given operator.
    _begin (op) {
      let newNode = {
        type: op,
        nodes: [],
      };

      let current = this._current();

      this.stack.push( current.nodes.length );

      current.nodes.push(newNode);

      return this;
    }

    // Getting current node from tree
    _current ()) {
      let current = this.tree;

      for (let num of this.stack) {
        current = current.nodes[num];
      }

      return current;
    }


    // Begin a nested expression and combine it with the current expression using the intersection operator (AND).
    and_begin () {
      return this._begin('AND');
    }


    // Begin a nested expression and combine it with the current expression using the union operator (OR).
    or_begin () {
      return this._begin('OR');
    }


    /**
     * End the current compound expression. 
     *
     * This will throw an error if begin() hasn't been called yet.
     */
    end () {
      if (!this.stack.length) {
        throw new Error("begin() needs to be called");
      }

      this.stack.pop();

      return this;
    }



    // Combine the current expression with the given expression using the intersection operator (AND).
    and (expr, param) {
      if (!expr || typeof expr !== "string") {
        throw new Error("expr must be a string");
      } else {
        this._current().nodes.push({
          type: 'AND',
          expr: expr,
          para: param,
        });
      }

      return this;
    }



    // Combine the current expression with the given expression using the union operator (OR).
    or (expr, param) {
      if (!expr || typeof expr !== "string") {
        throw new Error("expr must be a string");
      } else {
        this._current().nodes.push({
          type: 'OR',
          expr: expr,
          para: param,
        });
      }

      return this;
    }


    // Get the final fully constructed expression string.
    toString () {
      if (this.stack.length) {
        throw new Error("end() needs to be called");
      }

      return this._toString(this.tree);
    }


    // Get the final fully constructed expression string.
    toParam () {
      if (this.stack.length) {
        throw new Error("end() needs to be called");
      }

      return this._toString(this.tree, true);
    }



    // Get a string representation of the given expression tree node.
    _toString (node, paramMode = false) {
      let str = "";
      let params = [];

      for (child of node.nodes) {
        if (undefined !== child.expr) {
          let nodeStr = child.expr;

          // have param
          if (undefined !== child.para) {
            if (!paramMode) {
              nodeStr = nodeStr.replace(
                this.options.parameterCharacter, this._formatValue(child.para)
              );
            }
            else {
              let cv = this._formatValueAsParam(child.para);

              if (undefined !== cv && undefined !== cv.text) {
                params = params.concat(cv.values);

                nodeStr = nodeStr.replace(
                  this.options.parameterCharacter, `(${cv.text})`
                );
              }
              else {
                params = params.concat(cv);
              }

              // IN ? -> IN (?, ?, ..., ?)
              if _isArray(child.para) {
                let arr = Array.apply(null, new Array(child.para.length));

                let inStr = arr.map(() => {
                  return this.options.parameterCharacter;
                });

                nodeStr = nodeStr.replace(
                  this.options.parameterCharacter, `(${inStr.join(', ')})`
                );
              }
            }
          }
        }
        else {
          let nodeStr = this._toString(child, paramMode);

          if (paramMode) {
            params = params.concat(nodeStr.values);

            nodeStr = nodeStr.text;
          }

          // wrap nested expressions in brackets
          if (nodeStr.length) {
            nodeStr = `(${nodeStr})`;
          }
        }

        if (nodeStr.length) {
          // if this isn't first expression then add the operator
          if (str.length) {
            str += " " + child.type + " ";
          }

          str += nodeStr;
        }
      } // for-each child

      if (paramMode)
        return {
          text: str,
          values: params,
        };
      else {
        return str;
      }
    }

  }


 




  # ---------------------------------------------------------------------------------------------------------
  # ---------------------------------------------------------------------------------------------------------
  # cls.Case
  # ---------------------------------------------------------------------------------------------------------
  # ---------------------------------------------------------------------------------------------------------



  # An SQL CASE expression builder.
  #
  # SQL cases are used to select proper values based on specific criteria.
  #
  class cls.Case extends cls.BaseBuilder

    # Cases
    cases: null

    # Else value
    elseValue: null

    constructor: (fieldName, options = {}) ->
      super()

      if _isPlainObject(fieldName)
        options = fieldName
        fieldName = null

      if fieldName
        @fieldName = @_sanitizeField( fieldName )

      @options = _extend {}, cls.DefaultQueryBuilderOptions, options

      @cases = []

    'when': (expression, values...) ->
      @cases.unshift
        expression: expression,
        values: values
      @

    'then': (result) ->
      if @cases.length == 0
        throw new Error "when() needs to be called first"

      @cases[0].result = result;
      @

    'else': (@elseValue) ->
      @

    # Get the final fully constructed expression string.
    toString: ->
      @_toString @cases, @elseValue

    # Get the final fully constructed expression string.
    toParam: ->
      @_toString @cases, @elseValue, true

    # Get a string representation of the given expression tree node.
    _toString: (cases, elseValue, paramMode = false) ->
      if cases.length == 0 
        return @_formatValue(elseValue)

      values = []
      cases = cases.map (part) =>
        condition = new cls.AbstractConditionBlock("WHEN")
        condition._condition.apply(condition, [part.expression].concat(part.values))
        str = ''
        if not paramMode
          str = condition.buildStr()
        else
          condition = condition.buildParam()
          str = condition.text
          values = values.concat(condition.values)

        str + ' THEN ' + @_formatValue(part.result)

      str = cases.join(" ") + ' ELSE ' + @_formatValue(elseValue) + ' END'
      if @fieldName
        str = @fieldName + " " + str
      str = "CASE " + str

      if paramMode
        return {
          text: str
          values: values
        }
      else
        return str




  # ---------------------------------------------------------------------------------------------------------
  # ---------------------------------------------------------------------------------------------------------
  # Building blocks
  # ---------------------------------------------------------------------------------------------------------
  # ---------------------------------------------------------------------------------------------------------



  # A building block represents a single build-step within a query building process.
  #
  # Query builders consist of one or more building blocks which get run in a particular order. Building blocks can
  # optionally specify methods to expose through the query builder interface. They can access all the input data for
  # the query builder and manipulate it as necessary, as well as append to the final query string output.
  #
  # If you wish to customize how queries get built or add proprietary query phrases and content then it is recommended
  # that you do so using one or more custom building blocks.
  #
  # Original idea posted in https://github.com/hiddentao/export/issues/10#issuecomment-15016427
  class cls.Block extends cls.BaseBuilder
    # Get input methods to expose within the query builder.
    #
    # By default all methods except the following get returned:
    #   methods prefixed with _
    #   constructor and buildStr()
    #
    # @return Object key -> function pairs
    exposedMethods: ->
      ret = {}

      for attr, value of @
        # only want functions from this class
        if typeof value is "function" and attr.charAt(0) isnt '_' and !cls.Block::[attr]
          ret[attr] = value

      ret

    # Build this block.
    #
    # Subclasses may override this method.
    #
    # @param queryBuilder cls.QueryBuilder a reference to the query builder that owns this block.
    #
    # @return String the string representing this block
    buildStr: (queryBuilder) ->
      ''

    buildParam: (queryBuilder) ->
      { text: @buildStr(queryBuilder), values: [] }


  # A String which always gets output
  class cls.StringBlock extends cls.Block
    constructor: (options, str) ->
      super options
      @str = str

    buildStr: (queryBuilder) ->
      @str



  # An arbitrary value or db function with parameters
  class cls.AbstractValueBlock extends cls.Block
    # Constructor
    constructor: (options) ->
      super options
      @_str = ''
      @_values = []

    _setValue: (str, values...) ->
      @_str = str
      @_values = values
      @

    buildStr: (queryBuilder) ->
      str = @_str
      finalStr = ''
      values = [].concat @_values

      for idx in [0...str.length]
        c = str.charAt(idx)
        if @options.parameterCharacter is c and 0 < values.length
          c = values.shift()
        finalStr += c

      finalStr

    buildParam: (queryBuilder) ->
      { text: @_str, values: @_values }



  # A function string block
  class cls.FunctionBlock extends cls.AbstractValueBlock
    function: (str, values...) ->
      @_setValue.apply(@, [str].concat(values))


  # Construct a FunctionValueBlock object for use as a value
  cls.fval = (str, values...) ->
    inst = new cls.FunctionBlock()
    inst.function.apply(inst, [str].concat(values))

  # value handler for FunctionValueBlock objects
  cls.registerValueHandler cls.FunctionBlock, (value, asParam = false) ->
    if asParam
      value.buildParam()
    else
      value.buildStr()



  # Table specifier base class
  #
  # Additional options
  #  - singleTable - only allow one table to be specified  (default: false)
  #  - allowNested - allow nested query to be specified as a table    (default: false)
  class cls.AbstractTableBlock extends cls.Block
    constructor: (options) ->
      super options
      @tables = []

    # Update given table.
    #
    # An alias may also be specified for the table.
    #
    # Concrete subclasses should provide a method which calls this
    _table: (table, alias = null) ->
      alias = @_sanitizeTableAlias(alias) if alias
      table = @_sanitizeTable(table, @options.allowNested or false)

      if @options.singleTable
        @tables = []

      @tables.push
        table: table
        alias: alias

    # get whether a table has been set
    _hasTable: ->
      return 0 < @tables.length

    buildStr: (queryBuilder) ->
      return "" if not @_hasTable()

      tables = ""
      for table in @tables
        tables += ", " if "" isnt tables
        if "string" is typeof table.table
          tables += table.table
        else
          # building a nested query
          tables += "(#{table.table})"

        if table.alias
          # add the table alias, the AS keyword is optional
          tables += " #{table.alias}"

      tables

    _buildParam: (queryBuilder, prefix = null) ->
      ret =
        text: ""
        values: []

      params = []
      paramStr = ""

      if not @_hasTable() then return ret

      # retrieve the parameterised queries
      for blk in @tables
        if "string" is typeof blk.table
          p = { "text": "#{blk.table}", "values": [] }
        else if blk.table instanceof cls.QueryBuilder
          # building a nested query
          blk.table.updateOptions( { "nestedBuilder": true } )
          p = blk.table.toParam()
        else
          # building a nested query
          blk.updateOptions( { "nestedBuilder": true } )
          p = blk.buildParam(queryBuilder)
        p.table = blk
        params.push( p )

      # join the queries and their parameters
      # this is the last building block processed so always add UNION if there are any UNION blocks
      for p in params
        if paramStr isnt ""
          paramStr += ", "
        else
          paramStr += "#{prefix} #{paramStr}" if prefix? and prefix isnt ""
          paramStr
        if "string" is typeof p.table.table
          paramStr += "#{p.text}"
        else
          paramStr += "(#{p.text})"

          # add the table alias, the AS keyword is optional
        paramStr += " #{p.table.alias}" if p.table.alias?

        for v in p.values
          ret.values.push( @_formatCustomValue v )
      ret.text += paramStr

      ret

    buildParam: (queryBuilder) ->
      @_buildParam(queryBuilder)


  # Update Table
  class cls.UpdateTableBlock extends cls.AbstractTableBlock
    table: (table, alias = null) ->
      @_table(table, alias)

  # FROM table
  class cls.FromTableBlock extends cls.AbstractTableBlock
    from: (table, alias = null) ->
      @_table(table, alias)

    buildStr: (queryBuilder) ->
      tables = super queryBuilder

      if tables.length
        return "FROM #{tables}"
      else
        return ""

    buildParam: (queryBuilder) ->
      @_buildParam(queryBuilder, "FROM")


  # INTO table
  class cls.IntoTableBlock extends cls.Block
    constructor: (options) ->
      super options
      @table = null

    # Into given table.
    into: (table) ->
      # do not allow nested table to be the target
      @table = @_sanitizeTable(table, false)

    buildStr: (queryBuilder) ->
      if not @table then throw new Error "into() needs to be called"
      "INTO #{@table}"



  # (SELECT) Get field
  class cls.GetFieldBlock extends cls.Block
    constructor: (options) ->
      super options
      @_fieldAliases = {}
      @_fields = []


    # Add the given fields to the final result set.
    #
    # The parameter is an Object containing field names (or database functions) as the keys and aliases for the fields
    # as the values. If the value for a key is null then no alias is set for that field.
    #
    # Internally this method simply calls the field() method of this block to add each individual field.
    #
    # options.ignorePeriodsForFieldNameQuotes - whether to ignore period (.) when automatically quoting the field name
    fields: (_fields, options = {}) ->
      if Array.isArray(_fields)
        for field in _fields
          @field field, null, options
      else
        for field, alias of _fields
          @field(field, alias, options)


    # Add the given field to the final result set.
    #
    # The 'field' parameter does not necessarily have to be a fieldname. It can use database functions too,
    # e.g. DATE_FORMAT(a.started, "%H")
    #
    # An alias may also be specified for this field.
    #
    # options.ignorePeriodsForFieldNameQuotes - whether to ignore period (.) when automatically quoting the field name
    field: (field, alias = null, options = {}) ->
      alias = @_sanitizeFieldAlias(alias) if alias

      # if field-alias already present then don't add
      return if @_fieldAliases[field] is alias

      fieldRec = {
        alias : alias
      }

      if field instanceof cls.Case
        fieldRec.func = field
      else
        fieldRec.name = @_sanitizeField(field, options)

      if options.aggregation
        fieldRec.aggregation = options.aggregation

      @_fieldAliases[field] = alias
      @_fields.push(fieldRec)

    buildStr: (queryBuilder) ->
      @_build(queryBuilder)

    buildParam: (queryBuilder) ->
      @_build(queryBuilder, true)

    _build: (queryBuilder, paramMode = false) ->
      if not queryBuilder.getBlock(cls.FromTableBlock)._hasTable()
        if paramMode
          return {
            text : "", 
            values : []
          }
        else 
          return "" 

      fields = ""
      values = []

      for field in @_fields
        fields += ", " if "" isnt fields
        if field.aggregation
          fields += field.aggregation + "(";
        if field.func
          if paramMode
            caseExpr = field.func.toParam()
            fields += caseExpr.text
            values = values.concat(caseExpr.values)
          else
            fields += field.func.toString()
        else 
          fields += field.name
        if field.aggregation
          fields += ")";
        fields += " AS #{field.alias}" if field.alias

      if fields == ""
        fields = "*"

      if paramMode 
        return {text : fields, values : values}
      else 
        return fields



  # Base class for setting fields to values (used for INSERT and UPDATE queries)
  class cls.AbstractSetFieldBlock extends cls.Block
    constructor: (options) ->
      super options
      @fieldOptions = []
      @fields = []
      @values = []

    # Update the given field with the given value.
    # This will override any previously set value for the given field.
    _set: (field, value, options = {}) ->
      throw new Error "Cannot call set or setFields on multiple rows of fields."  if @values.length > 1

      value = @_sanitizeValue(value) if undefined isnt value

      # Explicity overwrite existing fields
      index = @fields.indexOf(@_sanitizeField(field, options))
      if index isnt -1
        @values[0][index] = value
        @fieldOptions[0][index] = options
      else
        @fields.push @_sanitizeField(field, options)
        index = @fields.length - 1

        # The first value added needs to create the array of values for the row
        if Array.isArray(@values[0])
          @values[0][index] = value
          @fieldOptions[0][index] = options
        else
          @values.push [value]
          @fieldOptions.push [options]

      @


    # Insert fields based on the key/value pairs in the given object
    _setFields: (fields, options = {}) ->
      throw new Error "Expected an object but got " + typeof fields unless typeof fields is 'object'

      for own field of fields
        @_set field, fields[field], options
      @


    # Insert multiple rows for the given fields. Accepts an array of objects.
    # This will override all previously set values for every field.
    _setFieldsRows: (fieldsRows, options = {}) ->
      throw new Error "Expected an array of objects but got " + typeof fieldsRows unless Array.isArray(fieldsRows)

      # Reset the objects stored fields and values
      @fields = []
      @values = []
      for i in [0...fieldsRows.length]
        for own field of fieldsRows[i]

          index = @fields.indexOf(@_sanitizeField(field, options))
          throw new Error 'All fields in subsequent rows must match the fields in the first row' if 0 < i and -1 is index

          # Add field only if it hasn't been added before
          if -1 is index
            @fields.push @_sanitizeField(field, options)
            index = @fields.length - 1

          value = @_sanitizeValue(fieldsRows[i][field])

          # The first value added needs to add the array
          if Array.isArray(@values[i])
            @values[i][index] = value
            @fieldOptions[i][index] = options
          else
            @values[i] = [value]
            @fieldOptions[i] = [options]
      @

    buildStr: ->
      throw new Error('Not yet implemented')

    buildParam: ->
      throw new Error('Not yet implemented')



  # (UPDATE) SET field=value
  class cls.SetFieldBlock extends cls.AbstractSetFieldBlock

    set: (field, value, options) ->
      @_set field, value, options

    setFields: (fields, options) ->
      @_setFields fields, options

    buildStr: (queryBuilder) ->
      if 0 >= @fields.length then throw new Error "set() needs to be called"

      str = ""
      for i in [0...@fields.length]
        field = @fields[i]
        str += ", " if "" isnt str
        value = @values[0][i]
        fieldOptions = @fieldOptions[0][i]
        if typeof value is 'undefined'  # e.g. if field is an expression such as: count = count + 1
          str += field
        else
          str += "#{field} = #{@_formatValue(value, fieldOptions)}"

      "SET #{str}"

    buildParam: (queryBuilder) ->
      if 0 >= @fields.length then throw new Error "set() needs to be called"

      str = ""
      vals = []
      for i in [0...@fields.length]
        field = @fields[i]
        str += ", " if "" isnt str
        value = @values[0][i]
        if typeof value is 'undefined'  # e.g. if field is an expression such as: count = count + 1
          str += field
        else
          p = @_formatValueAsParam( value )
          if p?.text?
            str += "#{field} = (#{p.text})"
            for v in p.values
              vals.push v
          else
            str += "#{field} = #{@options.parameterCharacter}"
            vals.push p

      { text: "SET #{str}", values: vals }



  # (INSERT INTO) ... field ... value
  class cls.InsertFieldValueBlock extends cls.AbstractSetFieldBlock
    set: (field, value, options = {}) ->
      @_set field, value, options

    setFields: (fields, options) ->
      @_setFields fields, options

    setFieldsRows: (fieldsRows, options) ->
      @_setFieldsRows fieldsRows, options

    _buildVals: ->
      vals = []
      for i in [0...@values.length]
        for j in [0...@values[i].length]
          formattedValue = @_formatValue(@values[i][j], @fieldOptions[i][j])
          if 'string' is typeof vals[i]
            vals[i] += ', ' + formattedValue
          else
            vals[i] = '' + formattedValue
      vals

    _buildValParams: ->
      vals = []
      params = []

      for i in [0...@values.length]
        for j in [0...@values[i].length]
          p = @_formatValueAsParam( @values[i][j] )
          if p?.text?
            str = p.text
            for v in p.values
              params.push v
          else
            str = @options.parameterCharacter
            params.push p
          if 'string' is typeof vals[i]
            vals[i] += ", #{str}"
          else
            vals[i] = "#{str}"


      vals: vals
      params: params

    buildStr: (queryBuilder) ->
      return '' if 0 >= @fields.length

      "(#{@fields.join(', ')}) VALUES (#{@_buildVals().join('), (')})"

    buildParam: (queryBuilder) ->
      return { text: '', values: [] } if 0 >= @fields.length

      # fields
      str = ""
      {vals, params} = @_buildValParams()
      for i in [0...@fields.length]
        str += ", " if "" isnt str
        str += @fields[i]

      { text: "(#{str}) VALUES (#{vals.join('), (')})", values: params }



  # (INSERT INTO) ... field ... (SELECT ... FROM ...)
  class cls.InsertFieldsFromQueryBlock extends cls.Block
    constructor: (options) ->
      super options
      @_fields = []
      @_query = null

    fromQuery: (fields, selectQuery) ->
      @_fields = fields.map ( (v) => @_sanitizeField(v) )
      @_query = @_sanitizeNestableQuery(selectQuery)

    buildStr: (queryBuilder) ->
      return '' if 0 >= @_fields.length

      "(#{@_fields.join(', ')}) (#{@_query.toString()})"

    buildParam: (queryBuilder) ->
      return { text: '', values: [] } if 0 >= @_fields.length

      @_query.updateOptions( { "nestedBuilder": true } )
      qryParam = @_query.toParam()

      {
        text: "(#{@_fields.join(', ')}) (#{qryParam.text})",
        values: qryParam.values,
      }



  # DISTINCT
  class cls.DistinctBlock extends cls.Block
    constructor: (options) ->
      super options
      @useDistinct = false

    # Add the DISTINCT keyword to the query.
    distinct: ->
      @useDistinct = true

    buildStr: (queryBuilder) ->
      if @useDistinct then "DISTINCT" else ""



  # GROUP BY
  class cls.GroupByBlock extends cls.Block
    constructor: (options) ->
      super options
      @groups = []

    # Add a GROUP BY transformation for the given field.
    group: (field) ->
      field = @_sanitizeField(field)
      @groups.push field

    buildStr: (queryBuilder) ->
      groups = ""

      if 0 < @groups.length
        for f in @groups
          groups += ", " if "" isnt groups
          groups += f
        groups = "GROUP BY #{groups}"

      groups


  # OFFSET x
  class cls.OffsetBlock extends cls.Block
    constructor: (options) ->
      super options
      @offsets = null

    # Set the OFFSET transformation.
    #
    # Call this will override the previously set offset for this query. Also note that Passing 0 for 'max' will remove
    # the offset.
    offset: (start) ->
      start = @_sanitizeLimitOffset(start)
      @offsets = start

    buildStr: (queryBuilder) ->
      if @offsets then "OFFSET #{@offsets}" else ""


  # Abstract condition base class
  class cls.AbstractConditionBlock extends cls.Block
    constructor: (@conditionVerb, options) ->
      super options
      @conditions = []

    # Add a condition.
    #
    # When the final query is constructed all the conditions are combined using the intersection (AND) operator.
    #
    # Concrete subclasses should provide a method which calls this
    _condition: (condition, values...) ->
      condition = @_sanitizeCondition(condition)

      finalCondition = ""
      finalValues = []

      # if it's an Expression instance then convert to text and values
      if condition instanceof cls.Expression
        t = condition.toParam()
        finalCondition = t.text
        finalValues = t.values
      else
        for idx in [0...condition.length]
          c = condition.charAt(idx)
          if @options.parameterCharacter is c and 0 < values.length
            nextValue = values.shift()
            if Array.isArray(nextValue) # where b in (?, ? ?)
              inValues = []
              for item in nextValue
                inValues.push @_sanitizeValue(item)
              finalValues = finalValues.concat(inValues)
              finalCondition += "(#{(@options.parameterCharacter for item in inValues).join ', '})"
            else
              finalCondition += @options.parameterCharacter
              finalValues.push @_sanitizeValue(nextValue)
          else
            finalCondition += c

      if "" isnt finalCondition
        @conditions.push
          text: finalCondition
          values: finalValues


    buildStr: (queryBuilder) ->
      if 0 >= @conditions.length then return ""

      condStr = ""

      for cond in @conditions
        if "" isnt condStr then condStr += ") AND ("
        if 0 < cond.values.length
          # replace placeholders with actual parameter values
          pIndex = 0
          for idx in [0...cond.text.length]
            c = cond.text.charAt(idx)
            if @options.parameterCharacter is c
              condStr += @_formatValue( cond.values[pIndex++] )
            else
              condStr += c
        else
          condStr += cond.text

      "#{@conditionVerb} (#{condStr})"


    buildParam: (queryBuilder) ->
      ret =
        text: ""
        values: []

      if 0 >= @conditions.length then return ret

      condStr = ""

      for cond in @conditions
        if "" isnt condStr then condStr += ") AND ("
        str = cond.text.split(@options.parameterCharacter)
        i = 0
        for v in cond.values
          condStr += "#{str[i]}" if str[i]?
          p = @_formatValueAsParam(v)
          if (p?.text?)
            condStr += "(#{p.text})"
            for qv in p.values
              ret.values.push( qv )
          else
            condStr += @options.parameterCharacter
            ret.values.push( p )
          i = i+1
        condStr += "#{str[i]}" if str[i]?
      ret.text = "#{@conditionVerb} (#{condStr})"
      ret


  # WHERE
  class cls.WhereBlock extends cls.AbstractConditionBlock
    constructor: (options) ->
      super 'WHERE', options

    where: (condition, values...) ->
      @_condition condition, values...


  # HAVING
  class cls.HavingBlock extends cls.AbstractConditionBlock
    constructor: (options) ->
      super 'HAVING', options

    having: (condition, values...) ->
      @_condition condition, values...


  # ORDER BY
  class cls.OrderByBlock extends cls.Block
    constructor: (options) ->
      super options
      @orders = []
      @_values = []

    # Add an ORDER BY transformation for the given field in the given order.
    #
    # To specify descending order pass false for the 'asc' parameter.
    order: (field, asc, values...) ->
      field = @_sanitizeField(field)

      asc = true if asc is undefined
      asc = !!asc if asc isnt null

      @_values = values

      @orders.push
        field: field
        dir: asc

    _buildStr: (toParam = false) ->
      if 0 < @orders.length
        pIndex = 0
        orders = ""
        for o in @orders
          orders += ", " if "" isnt orders

          fstr = ""

          if not toParam
            for idx in [0...o.field.length]
              c = o.field.charAt(idx)
              if @options.parameterCharacter is c
                fstr += @_formatValue( @_values[pIndex++] )
              else
                fstr += c
          else
            fstr = o.field

          orders += "#{fstr}"

          if o.dir isnt null
            orders += " #{if o.dir then 'ASC' else 'DESC'}"

        "ORDER BY #{orders}"
      else
        ""

    buildStr: (queryBuilder) ->
      @_buildStr()

    buildParam: (queryBuilder) ->
      {
        text: @_buildStr(true)
        values: @_values.map (v) => @_formatValueAsParam(v)
      }


  # LIMIT
  class cls.LimitBlock extends cls.Block
    constructor: (options) ->
      super options
      @limits = null

    # Set the LIMIT transformation.
    #
    # Call this will override the previously set limit for this query. Also note that Passing 0 for 'max' will remove
    # the limit.
    limit: (max) ->
      max = @_sanitizeLimitOffset(max)
      @limits = max


    buildStr: (queryBuilder) ->
      if @limits || @limits == 0 then "LIMIT #{@limits}" else ""



  # JOIN
  class cls.JoinBlock extends cls.Block
    constructor: (options) ->
      super options
      @joins = []


    # Add a JOIN with the given table.
    #
    # 'table' is the name of the table to join with.
    #
    # 'alias' is an optional alias for the table name.
    #
    # 'condition' is an optional condition (containing an SQL expression) for the JOIN. If this is an instance of
    # an expression builder then it gets evaluated straight away.
    #
    # 'type' must be either one of INNER, OUTER, LEFT or RIGHT. Default is 'INNER'.
    #
    join: (table, alias = null, condition = null, type = 'INNER') ->
      table = @_sanitizeTable(table, true)
      alias = @_sanitizeTableAlias(alias) if alias
      condition = @_sanitizeCondition(condition) if condition

      @joins.push
        type: type
        table: table
        alias: alias
        condition: condition
      @


    # Add a LEFT JOIN with the given table.
    left_join: (table, alias = null, condition = null) ->
      @join table, alias, condition, 'LEFT'

    # Add a RIGHT JOIN with the given table.
    right_join: (table, alias = null, condition = null) ->
      @join table, alias, condition, 'RIGHT'

    # Add an OUTER JOIN with the given table.
    outer_join: (table, alias = null, condition = null) ->
      @join table, alias, condition, 'OUTER'

    # Add a LEFT JOIN with the given table.
    left_outer_join: (table, alias = null, condition = null) ->
      @join table, alias, condition, 'LEFT OUTER'

    # Add an FULL JOIN with the given table.
    full_join: (table, alias = null, condition = null) ->
      @join table, alias, condition, 'FULL'

    # Add an CROSS JOIN with the given table.
    cross_join: (table, alias = null, condition = null) ->
      @join table, alias, condition, 'CROSS'

    buildStr: (queryBuilder) ->
      joins = ""

      for j in (@joins or [])
        if joins isnt "" then joins += " "
        joins += "#{j.type} JOIN "
        if "string" is typeof j.table
          joins += j.table
        else
          joins += "(#{j.table})"
        joins += " #{j.alias}" if j.alias
        joins += " ON (#{j.condition})" if j.condition

      joins

    buildParam: (queryBuilder) ->
      ret =
        text: ""
        values: []

      params = []
      joinStr = ""

      if 0 >= @joins.length then return ret

      # retrieve the parameterised queries
      for blk in @joins

        if "string" is typeof blk.table
          p = { "text": "#{blk.table}", "values": [] }
        else if blk.table instanceof cls.QueryBuilder
          # building a nested query
          blk.table.updateOptions( { "nestedBuilder": true } )
          p = blk.table.toParam()
        else
          # building a nested query
          blk.updateOptions( { "nestedBuilder": true } )
          p = blk.buildParam(queryBuilder)

        if blk.condition instanceof cls.Expression
          cp = blk.condition.toParam()
          p.condition = cp.text
          p.values = p.values.concat(cp.values)
        else
          p.condition = blk.condition

        p.join = blk
        params.push( p )

      # join the queries and their parameters
      # this is the last building block processed so always add UNION if there are any UNION blocks
      for p in params
        if joinStr isnt "" then joinStr += " "
        joinStr += "#{p.join.type} JOIN "
        if "string" is typeof p.join.table
          joinStr += p.text
        else
          joinStr += "(#{p.text})"
        joinStr += " #{p.join.alias}" if p.join.alias
        joinStr += " ON (#{p.condition})" if p.condition

        for v in p.values
          ret.values.push( @_formatCustomValue v )
      ret.text += joinStr

      ret


  # UNION
  class cls.UnionBlock extends cls.Block
    constructor: (options) ->
      super options
      @unions = []


    # Add a UNION with the given table/query.
    #
    # 'table' is the name of the table or query to union with.
    #
    #
    # 'type' must be either one of UNION or UNION ALL.... Default is 'UNION'.
    #
    union: (table, type = 'UNION') ->
      table = @_sanitizeTable(table, true)

      @unions.push
        type: type
        table: table
      @

    # Add a UNION ALL with the given table/query.
    union_all: (table) ->
      @union table, 'UNION ALL'

    buildStr: (queryBuilder) ->
      unionStr = ""

      for j in (@unions or [])
        if unionStr isnt "" then unionStr += " "
        unionStr += "#{j.type} "
        if "string" is typeof j.table
          unionStr += j.table
        else
          unionStr += "(#{j.table})"

      unionStr

    buildParam: (queryBuilder) ->
      ret =
        text: ""
        values: []

      params = []
      unionStr = ""

      if 0 >= @unions.length then return ret

      # retrieve the parameterised queries
      for blk in (@unions or [])
        if "string" is typeof blk.table
          p = { "text": "#{blk.table}", "values": [] }
        else if blk.table instanceof cls.QueryBuilder
          # building a nested query
          blk.table.updateOptions( { "nestedBuilder": true } )
          p = blk.table.toParam()
        else
          # building a nested query
          blk.updateOptions( { "nestedBuilder": true } )
          p = blk.buildParam(queryBuilder)
        p.type = blk.type
        params.push( p )

      # join the queries and their parameters
      # this is the last building block processed so always add UNION if there are any UNION blocks
      for p in params
        unionStr += " " if unionStr isnt ""
        unionStr += "#{p.type} (#{p.text})"
        for v in p.values
          ret.values.push( @_formatCustomValue v )
      ret.text += unionStr

      ret



  # ---------------------------------------------------------------------------------------------------------
  # ---------------------------------------------------------------------------------------------------------
  # Query builders
  # ---------------------------------------------------------------------------------------------------------
  # ---------------------------------------------------------------------------------------------------------


  # Query builder base class
  #
  # Note that the query builder does not check the final query string for correctness.
  #
  # All the build methods in this object return the object instance for chained method calling purposes.
  class cls.QueryBuilder extends cls.BaseBuilder
    # Constructor
    #
    # blocks - array of cls.BaseBuilderBlock instances to build the query with.
    constructor: (options, blocks) ->
      super options

      @blocks = blocks or []

      # Copy exposed methods into myself
      for block in @blocks
        for methodName, methodBody of block.exposedMethods()
          if @[methodName]?
            throw new Error "#{@_getObjectClassName(@)} already has a builder method called: #{methodName}"

          ( (block, name, body) =>
            @[name] = =>
              body.apply(block, arguments)
              @
          )(block, methodName, methodBody)


    # Register a custom value handler for this query builder and all its contained blocks.
    #
    # Note: This will override any globally registered handler for this value type.
    registerValueHandler: (type, handler) ->
      for block in @blocks
        block.registerValueHandler type, handler
      super type, handler
      @

    # Update query builder options
    #
    # This will update the options for all blocks too. Use this method with caution as it allows you to change the
    # behaviour of your query builder mid-build.
    updateOptions: (options) ->
      @options = _extend({}, @options, options)
      for block in @blocks
        block.options = _extend({}, block.options, options)


    # Get the final fully constructed query string.
    toString: ->
      (block.buildStr(@) for block in @blocks).filter (v) ->
        0 < v.length
      .join(@options.separator)

    # Get the final fully constructed query param obj.
    toParam: (options = undefined)->
      old = @options
      @options = _extend({}, @options, options) if options?
      result = { text: '', values: [] }
      blocks = (block.buildParam(@) for block in @blocks)
      result.text = (block.text for block in blocks).filter (v) ->
        0 < v.length
      .join(@options.separator)

      result.values = [].concat (block.values for block in blocks)...
      if not @options.nestedBuilder?
        if @options.numberedParameters || options?.numberedParametersStartAt?
          i = 1
          i = @options.numberedParametersStartAt if @options.numberedParametersStartAt?
          regex = new RegExp("\\" + @options.parameterCharacter, 'g')
          result.text = result.text.replace regex, () => "#{@options.numberedParametersPrefix}#{i++}"
      @options = old
      result

    # Deep clone
    clone: ->
      new @constructor @options, (block.clone() for block in @blocks)

    # Get whether queries built with this builder can be nested within other queries
    isNestable: ->
      false

    # Get a specific block
    getBlock: (blockType) ->
      @blocks.filter( (b) -> b instanceof blockType )[0]



  # SELECT query builder.
  class cls.Select extends cls.QueryBuilder
      constructor: (options, blocks = null) ->
        blocks or= [
          new cls.StringBlock(options, 'SELECT'),
          new cls.FunctionBlock(options),
          new cls.DistinctBlock(options),
          new cls.GetFieldBlock(options),
          new cls.FromTableBlock(_extend({}, options, { allowNested: true })),
          new cls.JoinBlock(_extend({}, options, { allowNested: true })),
          new cls.WhereBlock(options),
          new cls.GroupByBlock(options),
          new cls.HavingBlock(options),
          new cls.OrderByBlock(options),
          new cls.LimitBlock(options),
          new cls.OffsetBlock(options),
          new cls.UnionBlock(_extend({}, options, { allowNested: true }))
        ]

        super options, blocks

      isNestable: ->
        true



  # UPDATE query builder.
  class cls.Update extends cls.QueryBuilder
    constructor: (options, blocks = null) ->
      blocks or= [
        new cls.StringBlock(options, 'UPDATE'),
        new cls.UpdateTableBlock(options),
        new cls.SetFieldBlock(options),
        new cls.WhereBlock(options),
        new cls.OrderByBlock(options),
        new cls.LimitBlock(options)
      ]

      super options, blocks





  # DELETE query builder.
  class cls.Delete extends cls.QueryBuilder
    constructor: (options, blocks = null) ->
      blocks or= [
        new cls.StringBlock(options, 'DELETE'),
        new cls.FromTableBlock( _extend({}, options, { singleTable: true }) ),
        new cls.JoinBlock(options),
        new cls.WhereBlock(options),
        new cls.OrderByBlock(options),
        new cls.LimitBlock(options),
      ]

      super options, blocks





  # An INSERT query builder.
  #
  class cls.Insert extends cls.QueryBuilder
    constructor: (options, blocks = null) ->
      blocks or= [
        new cls.StringBlock(options, 'INSERT'),
        new cls.IntoTableBlock(options),
        new cls.InsertFieldValueBlock(options),
        new cls.InsertFieldsFromQueryBlock(options),
      ]

      super options, blocks


  _squel =
    VERSION: '<<VERSION_STRING>>'
    flavour: flavour
    expr: (options) -> new cls.Expression(options)
    case: (name, options) -> new cls.Case(name, options)
    select: (options, blocks) -> new cls.Select(options, blocks)
    update: (options, blocks) -> new cls.Update(options, blocks)
    insert: (options, blocks) -> new cls.Insert(options, blocks)
    delete: (options, blocks) -> new cls.Delete(options, blocks)
    registerValueHandler: cls.registerValueHandler
    fval: cls.fval

  # aliases
  _squel.remove = _squel.delete

  # classes
  _squel.cls = cls

  return _squel


# ---------------------------------------------------------------------------------------------------------
# ---------------------------------------------------------------------------------------------------------
# Exported API
# ---------------------------------------------------------------------------------------------------------
# ---------------------------------------------------------------------------------------------------------

squel = _buildSquel()

# AMD
if define?.amd
  define ->
    return squel
# CommonJS
else if module?.exports
  module.exports = squel
# Browser
else
  window?.squel = squel



# ---------------------------------------------------------------------------------------------------------
# ---------------------------------------------------------------------------------------------------------
# Squel SQL flavours
# ---------------------------------------------------------------------------------------------------------
# ---------------------------------------------------------------------------------------------------------

# Available flavours
squel.flavours = {}

# Setup Squel for a particular SQL flavour
squel.useFlavour = (flavour = null) ->
  return squel if not flavour

  if squel.flavours[flavour] instanceof Function
    s = _buildSquel(flavour)
    squel.flavours[flavour].call null, s
    return s
  else
    throw new Error "Flavour not available: #{flavour}"