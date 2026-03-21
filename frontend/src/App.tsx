import React, { useState } from 'react';
import { PokerTable } from './components/PokerTable';
import { Lobby } from './components/Lobby';

function App() {
  const [currentTableId, setCurrentTableId] = useState<string | null>(null);

  return (
    <div className="app-main">
      {currentTableId ? (
        <PokerTable 
          tableId={currentTableId} 
          onLeave={() => setCurrentTableId(null)} 
        />
      ) : (
        <Lobby onJoinTable={(id) => setCurrentTableId(id)} />
      )}
    </div>
  );
}

export default App;
