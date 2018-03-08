importScripts("https://cdn.pubnub.com/sdk/javascript/pubnub.4.20.2.min.js");

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
      timer: 1000,
      execution: 400,
      board: 300,
      snapshot: 3000
    },
    timer: {
      timer: null,
      execution: null,
      board: null,
      snapshot: null
    }
  };
  
  var pubnub = new PubNub({
    subscribeKey: 'sub-c-52a9ab50-291b-11e5-baaa-0619f8945a4f',
    keepAlive: true,
    listenToBrowserNetworkEvents: false
  });
  
  pubnub.addListener({
    message: function(msg){
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
        _state.snapshot = msg.message;
      }
    }
  });
  
  
  self.addEventListener("message", function(e){
    if(!e.data || typeof(e) !== "object") return;
    
    switch(e.data.type){
      case "start":
        _state.startTime = Date.now();
        _state.stats.startTime = _state.startTime;
        start(pubnub);
        break;
      case "change_interval":
        if(typeof(e.data.value) === "object"){
          _state.interval = e.data.value;
        }
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
  
    _state.timer.ticker = setTimeout(sendTicker, _state.interval.ticker);
  };
  
  var sendExecution = function(){
    if(_state.execution.length > 0){
      self.postMessage({
        channel: 'lightning_executions_FX_BTC_JPY',
        message: _state.execution
      });
      _state.execution = [];
    }
  
    _state.timer.execution = setTimeout(sendExecution, _state.interval.execution);
  };
  
  var sendBoard = function(){
    if(_state.board !== null){
      self.postMessage({
        channel: 'lightning_board_FX_BTC_JPY',
        message: _state.board
      });
      _state.board = null;
    }
  
    _state.timer.board = setTimeout(sendBoard, _state.interval.board);
  };
  
  var sendSnapshot = function(){
    if(_state.snapshot !== null){
      self.postMessage({
        channel: 'lightning_board_snapshot_FX_BTC_JPY',
        message: _state.snapshot
      });
      _state.snapshot = null;
    }
  
    _state.timer.snapshot = setTimeout(sendSnapshot, _state.interval.snapshot);
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

