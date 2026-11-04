import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { OutletProvider } from './lib/outlet';
import { ToastProvider } from './lib/toast';
import Navigation, { type Module } from './components/Navigation';
import DataManagement from './modules/DataManagement';
import InvoiceCapture from './modules/InvoiceCapture';
import BroilerYield from './modules/BroilerYield';
import RecipeBuilder from './modules/RecipeBuilder';
import ProductionRun from './modules/ProductionRun';
import TollManufacturing from './modules/TollManufacturing';
import MeatTracker from './modules/MeatTracker';
import Statistics from './modules/Statistics';
import ShiftHandoff from './modules/ShiftHandoff';
import Requisitions from './modules/Requisitions';
import SalesSync from './modules/SalesSync';

function Dashboard() {
  const [module, setModule] = useState<Module>('data');

  return (
    <OutletProvider>
      <div className="min-h-screen bg-surface-base">
        <Navigation active={module} onChange={setModule} />
        <main className="pb-16">
          {module === 'data'         && <DataManagement />}
          {module === 'invoice'      && <InvoiceCapture />}
          {module === 'broiler'      && <BroilerYield />}
          {module === 'recipe'       && <RecipeBuilder />}
          {module === 'production'   && <ProductionRun />}
          {module === 'toll'         && <TollManufacturing />}
          {module === 'meat'         && <MeatTracker />}
          {module === 'requisitions' && <Requisitions />}
          {module === 'stats'        && <Statistics />}
          {module === 'shift'        && <ShiftHandoff />}
          {module === 'sales'        && <SalesSync />}
        </main>
      </div>
    </OutletProvider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<Dashboard />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
