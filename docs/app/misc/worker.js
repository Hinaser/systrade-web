importScripts("https://cdn.pubnub.com/sdk/javascript/pubnub.4.20.2.min.js");

function console(){}
console.log = function(msg){
  if(typeof(msg) !== "string") msg = JSON.stringify(msg);
  self.postMessage({channel: "console.log", message: msg})
};

main();

function main(){
  var _state = {
    ticker: null,
    execution: [],
    board: null,
    snapshot: null,
    startTime: null,
    stats: {
      STATS_MAX_COUNT: 100,
      startTime: null,
      lastStatTime: {
        execution: null,
        ticker: null,
        board: null,
        snapshot: null
      },
      totalCount: {
        execution: 0,
        ticker: 0,
        board: 0,
        snapshot: 0
      },
      execution: [],
      ticker: [],
      board: [],
      snapshot: []
    },
    initialInterval: 300,
    interval: {
      ticker: 1000,
      execution: 400,
      board: 300,
      snapshot: 3000
    },
    boardConfig: {
      maxRows: 30
    },
    activeMonitoring: {
      enabled: true,
      marketEndpoint: "https://api.bitflyer.jp/v1/",
      requestInterval: {
        execution: 2000,
        snapshot: 6000
      }
    }
  };
  
  var _timers = {
    ticker: null,
    execution: null,
    board: null,
    snapshot: null,
    watchMarket: {
      snapshot: null,
      execution: null
    }
  };
  
  var pubnub = new PubNub({
    subscribeKey: 'sub-c-52a9ab50-291b-11e5-baaa-0619f8945a4f',
    keepAlive: true,
    listenToBrowserNetworkEvents: false
  });
  
  pubnub.addListener({
    message: onMessage
  });
  
  
  self.addEventListener("message", function(e){
    if(!e.data || typeof(e) !== "object") return;
    
    switch(e.data.type){
      case "start":
        updateConfig(e.data.value);
        
        _state.startTime = Date.now();
        _state.stats.startTime = _state.startTime;
        start(pubnub);
        watchMarket();
        break;
      case "update_config":
        updateConfig(e.data.value);
        break;
      case "get_state":
        self.postMessage({channel: "state", message: _state});
        break;
      case "get_stats":
        self.postMessage({channel: "stats", message: _state.stats});
        break;
      default:
        break;
    }
  });
  
  var sendTicker = function(){
    if(_state.ticker !== null){
      self.postMessage({
        channel: 'lightning_ticker_FX_BTC_JPY',
        message: _state.ticker
      });
      _state.ticker = null;
    }
  
    _timers.ticker = setTimeout(sendTicker, _state.interval.ticker);
  };
  
  var sendExecution = function(){
    if(_state.execution.length > 0){
      self.postMessage({
        channel: 'lightning_executions_FX_BTC_JPY',
        message: _state.execution
      });
      _state.execution = [];
    }
  
    _timers.execution = setTimeout(sendExecution, _state.interval.execution);
  };
  
  var sendBoard = function(){
    if(_state.board !== null){
      self.postMessage({
        channel: 'lightning_board_FX_BTC_JPY',
        message: _state.board
      });
      _state.board = null;
    }
  
    _timers.board = setTimeout(sendBoard, _state.interval.board);
  };
  
  var sendSnapshot = function(){
    if(_state.snapshot !== null){
      self.postMessage({
        channel: 'lightning_board_snapshot_FX_BTC_JPY',
        message: _state.snapshot
      });
      _state.snapshot = null;
    }
  
    _timers.snapshot = setTimeout(sendSnapshot, _state.interval.snapshot);
  };
  
  sendExecution();
  
  setTimeout(function(){
    sendBoard();
    
    setTimeout(function(){
      sendTicker();
  
      setTimeout(function(){
        sendSnapshot();
      }, _state.initialInterval);
    }, _state.initialInterval);
  }, _state.initialInterval);
  
  function setStat(propName){
    if(!_state.stats.lastStatTime[propName]){
      _state.stats.lastStatTime[propName] = Date.now();
      _state.stats[propName].push(_state.stats.lastStatTime[propName] - _state.stats.startTime);
    }
    else{
      var now = Date.now();
      _state.stats[propName].push(now - _state.stats.lastStatTime[propName]);
      while(_state.stats[propName].length > _state.stats.STATS_MAX_COUNT){
        _state.stats[propName].shift();
      }
      _state.stats.lastStatTime[propName] = now;
    }
    
    _state.stats.totalCount[propName]++;
  }
  
  function onMessage(msg){
    if(msg.channel === 'lightning_ticker_FX_BTC_JPY'){
      _state.ticker = msg.message;
    }
    else if(msg.channel === 'lightning_executions_FX_BTC_JPY'){
      _state.execution = _state.execution.concat(msg.message);
    }
    else if(msg.channel === 'lightning_board_FX_BTC_JPY'){
      if(_state.board === null){
        _state.board = msg.message;
      }
      else {
        var newBoard = msg.message;
        _state.board.mid_price = newBoard.mid_price;
        
        ["bids", "asks"].forEach(function(bid_ask){
          newBoard[bid_ask].forEach(function(newBoardItem){
            var oldBoardIndex = _state.board[bid_ask].findIndex(function(oldBoardItem){
              return oldBoardItem.price === newBoardItem.price;
            });
            
            if(oldBoardIndex > -1){
              if(newBoardItem.size > 0)
                _state.board[bid_ask][oldBoardIndex] = newBoardItem;
              else
                _state.board[bid_ask].splice(oldBoardIndex, 1)
            }
            else{
              if(newBoardItem.size > 0)
                _state.board[bid_ask].push(newBoardItem);
            }
          });
        });
      }
    }
    else if(msg.channel === 'lightning_board_snapshot_FX_BTC_JPY'){
      // board snapshot may be so huge. I confirmed that several thousand element of bids/asks.
      // This may impact sort performance heavily on device which does not have sufficient computing resource.
      // So I made an option to cut verbose elements.
      if(typeof(_state.boardConfig.maxRows) === "number" && _state.boardConfig.maxRows > 0){
        var bids = msg.message.bids;
        var asks = msg.message.asks;
        var sorter = function(a, b){
          if(a.price > b.price) return -1;
          if(a.price < b.price) return 1;
          return 0;
        };
        bids.sort(sorter);
        asks.sort(sorter);
        
        if(_state.boardConfig.maxRows > 0 && asks.length > _state.boardConfig.maxRows){
          asks.splice(0, asks.length - _state.boardConfig.maxRows);
        }
        if(_state.boardConfig.maxRows > 0 && bids.length > _state.boardConfig.maxRows){
          bids.splice(_state.boardConfig.maxRows - 1, bids.length - _state.boardConfig.maxRows);
        }
        
        msg.message.bids = bids;
        msg.message.asks = asks;
      }
      
      _state.snapshot = msg.message;
    }
  }
  
  function watchMarket(){
    var opt = _state.activeMonitoring;
    
    var requestSnapshotData = function(){
      if(opt.enabled && typeof(opt.requestInterval.snapshot) === "number" && opt.requestInterval.snapshot > 0){
        var p1 = requestSnapshot(opt.marketEndpoint).then(function(msg){
          onMessage(msg);
        });
      }
      
      _timers.watchMarket.snapshot = setTimeout(requestSnapshotData, opt.requestInterval.snapshot);
    };
    
    var requestExecutionData = function(){
      if(opt.enabled && typeof(opt.requestInterval.execution) === "number" && opt.requestInterval.execution > 0){
        var p1 = requestExecutions(opt.marketEndpoint).then(function(msg){
          onMessage(msg);
        });
      }
    
      _timers.watchMarket.execution = setTimeout(requestExecutionData, opt.requestInterval.execution);
    };
  
    requestExecutionData();
    requestSnapshotData();
  }
  
  function updateConfig(options){
    if(typeof(options) === "object"){
      if(typeof(options.interval) === "object"){
        Object.keys(options.interval).forEach(function(key){
          _state.interval[key] = options.interval[key];
        });
      }
      if(typeof(options.boardConfig) === "object"){
        Object.keys(options.boardConfig).forEach(function(key){
          _state.boardConfig[key] = options.boardConfig[key];
        });
      }
      if(typeof(options.activeMonitoring) === "object"){
        Object.keys(options.activeMonitoring).forEach(function(key){
          _state.activeMonitoring[key] = options.activeMonitoring[key];
        });
      }
    }
  }
}

function start(pubnub){
  pubnub.subscribe({
    channels: [
      'lightning_ticker_FX_BTC_JPY',
      'lightning_executions_FX_BTC_JPY',
      'lightning_board_snapshot_FX_BTC_JPY',
      'lightning_board_FX_BTC_JPY'
    ]
  });
}

function requestToMarket(marketEndpoint, path, product_code, count, before, after){
  var qs = [];
  if(product_code) qs.push("product_code=" + product_code);
  if(count) qs.push("count=" + count);
  if(before) qs.push("before=" + before);
  if(after) qs.push("after=" + after);
  if(qs.length > 0){
    path += "?" + qs.join("&");
  }
  
  return fetch(marketEndpoint + path, {
    method: "GET",
    mode: "cors"
  }).then(function(res){
    return res.json();
  });
}

function requestSnapshot(marketEndpoint){
  return requestToMarket(marketEndpoint, "board", "FX_BTC_JPY")
    .then(function(body){
      return {
        channel: "lightning_board_snapshot_FX_BTC_JPY",
        message: body
      };
    });
}

function requestExecutions(marketEndpoint, after, count){
  return requestToMarket(marketEndpoint, "executions", "FX_BTC_JPY", count, null, after)
    .then(function(body){
      try{
        body = body.map(function(exec){
          exec.exec_date += "Z"; // Just a Patch-work to fix date string to UTC
          return exec;
        });
      }
      catch(e){}
      
      return {
        channel: "lightning_executions_FX_BTC_JPY",
        message: body
      };
    });
}

