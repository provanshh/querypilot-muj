'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useQueryPilot } from '@/context/QueryPilotContext';
import { 
  Sparkles, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  Play, 
  Pause, 
  Building2, 
  Database, 
  Bot, 
  Terminal, 
  Activity, 
  CheckCircle2, 
  ArrowRight,
  Layers,
  Compass,
  Zap
} from 'lucide-react';

interface TourStep {
  title: string;
  badge: string;
  subtitle: string;
  description: string;
  talkingPoints: string[];
  spotlightZone?: 'center' | 'overview' | 'inspector' | 'crew' | 'mayor' | 'timeline' | 'switcher';
  action?: (context: any) => void;
}

export function InteractiveDemoTour() {
  const { 
    isDemoTourOpen, 
    setIsDemoTourOpen, 
    activeDatabase, 
    focusTable, 
    selectTable, 
    startInvestigation, 
    setActiveView, 
    selectDatabase,
    setNavigationTarget
  } = useQueryPilot();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlayingAuto, setIsPlayingAuto] = useState(false);

  const steps: TourStep[] = [
    {
      title: 'Welcome to QueryPilot',
      badge: '01 / 07 • The Big Idea',
      subtitle: "Don't Just Ask Your Database. Send a Crew.",
      description:
        'QueryPilot reimagines database analysis. Instead of staring at flat tables or crafting complex SQL by hand, your entire database is rendered as an interactive, living 3D isometric city with an autonomous multi-agent AI crew.',
      talkingPoints: [
        'Each Skyscraper represents a real database table.',
        'Building height and footprint scale with row volume and storage.',
        'Roads represent Foreign Key relationships and JOIN pathways.',
        'Specialized AI agents inhabit the city to autonomously investigate anomalies.',
      ],
      spotlightZone: 'center',
      action: () => {
        setActiveView('city');
        setNavigationTarget({ x: 28, y: 28 });
        selectTable(null);
      },
    },
    {
      title: 'Database Overview & Topology',
      badge: '02 / 07 • Schema KPIs',
      subtitle: 'Instant visibility into scale, health, and storage.',
      description:
        'The top-left panel gives engineers an instant high-level overview of total tables, foreign key relations, total row count, disk usage, and relational health score.',
      talkingPoints: [
        'Filter tables instantly using the real-time search input.',
        'Tables are categorized into Fact, Entity, Dimension, and Log tables.',
        'Relational health score automatically detects orphaned tables and missing foreign keys.',
      ],
      spotlightZone: 'overview',
      action: () => {
        setActiveView('city');
        setNavigationTarget({ x: 24, y: 24 });
      },
    },
    {
      title: 'Holographic Badges & Deep Inspection',
      badge: '03 / 07 • Spatial Navigation',
      subtitle: 'Glide smoothly to any skyscraper to inspect live schema metadata.',
      description:
        'Holographic nameplates float above every table skyscraper showing live row counts. Clicking any building or badge smoothly glides the camera directly to it and opens the Table Schema Inspector.',
      talkingPoints: [
        'Notice the buttery smooth camera glide when focusing on tables.',
        'Inspect column names, data types, nullability, and primary/foreign keys.',
        'Examine live synthetic row samples and active indexes directly in-engine.',
      ],
      spotlightZone: 'inspector',
      action: (ctx) => {
        const ordersTable = ctx.activeDatabase.tables.find((t: any) => t.name === 'orders') || ctx.activeDatabase.tables[0];
        if (ordersTable) {
          ctx.focusTable(ordersTable);
        }
      },
    },
    {
      title: 'The Multi-Agent AI Crew',
      badge: '04 / 07 • Autonomous Crew',
      subtitle: 'Four specialized agents collaborate like a senior engineering team.',
      description:
        'On the right sidebar sits your AI Crew. Each agent has an autonomous specialty and thought process, operating concurrently during investigations.',
      talkingPoints: [
        'Captain Nova (Lead Architect): Dissects natural language intent and formulates hypotheses.',
        'Cipher (SQL Synthesizer): Generates and executes high-performance multi-table SQL JOINs.',
        'Aegis (Data Validator): Verifies foreign key constraints, null integrity, and security bounds.',
        'Vektor (Optimization Specialist): Profiles query execution cost and suggests missing indexes.',
      ],
      spotlightZone: 'crew',
      action: () => {
        setActiveView('city');
      },
    },
    {
      title: "Mayor's Command Center",
      badge: '05 / 07 • Dispatch Directive',
      subtitle: 'Ask high-level business or engineering questions in natural language.',
      description:
        "The Mayor's Command Center at the bottom-left is your dispatch station. Simply type a directive or select one of the quick scenario presets to unleash the crew.",
      talkingPoints: [
        'Zero SQL syntax required — speak to your database like a colleague.',
        'Selectable mission categories: Anomaly Detection, Churn Analysis, Revenue Leakage, and Performance Audit.',
        'Auto-suggests relevant questions based on schema topology.',
      ],
      spotlightZone: 'mayor',
      action: () => {
        setActiveView('city');
      },
    },
    {
      title: 'Live Investigation Timeline',
      badge: '06 / 07 • Real-Time Execution',
      subtitle: 'Watch agents generate SQL, execute queries, and synthesize root causes.',
      description:
        'When a mission starts, the city lights up! Notice holographic beacons shooting from queried skyscrapers, while the timeline streams real-time hypotheses, SQL syntax, constraint checks, and final conclusions.',
      talkingPoints: [
        'Holographic data beams pulse above the orders and payments tables.',
        'Inspect exact SQL generated by Cipher with single-click copy.',
        'Aegis flags data anomalies with severity badges (Critical, Warning, Nominal).',
        'Executive root-cause synthesis is summarized for leadership and stakeholders.',
      ],
      spotlightZone: 'timeline',
      action: (ctx) => {
        ctx.startInvestigation(
          'Investigate sudden 23% drop in checkout conversion across European payment gateways',
          'anomaly'
        );
      },
    },
    {
      title: 'Procedural Generation & Schema Switching',
      badge: '07 / 07 • Universal Compatibility',
      subtitle: 'Works with arbitrary schemas — E-Commerce, FinTech, and SaaS.',
      description:
        'QueryPilot is completely schema-driven. Use the database selector in the top-right to switch to FinTech Fraud Detection or SaaS Product Telemetry, or paste custom schema JSON to generate a brand-new city on the fly.',
      talkingPoints: [
        'Deterministic Manhattan road routing connects related foreign key tables.',
        'Zero hardcoded maps — any PostgreSQL, MySQL, Snowflake, or ClickHouse schema works.',
        'Ready for production deployment with FastAPI WebSocket and SSE backend integration.',
      ],
      spotlightZone: 'switcher',
      action: () => {
        setActiveView('city');
      },
    },
  ];

  // Execute step action on step change
  useEffect(() => {
    if (isDemoTourOpen && steps[currentStepIndex]?.action) {
      steps[currentStepIndex].action({
        activeDatabase,
        focusTable,
        selectTable,
        startInvestigation,
        setActiveView,
        selectDatabase,
        setNavigationTarget,
      });
    }
  }, [currentStepIndex, isDemoTourOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isDemoTourOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        setIsDemoTourOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDemoTourOpen, currentStepIndex]);

  // Auto-play timer
  useEffect(() => {
    if (!isDemoTourOpen || !isPlayingAuto) return;

    const timer = setTimeout(() => {
      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex((prev) => prev + 1);
      } else {
        setIsPlayingAuto(false);
      }
    }, 7000);

    return () => clearTimeout(timer);
  }, [isDemoTourOpen, isPlayingAuto, currentStepIndex, steps.length]);

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      setIsDemoTourOpen(false);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  if (!isDemoTourOpen) return null;

  const currentStep = steps[currentStepIndex];

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex flex-col justify-end p-6 select-none animate-fadeIn">
      {/* Dimmed background overlay */}
      <div 
        onClick={() => setIsDemoTourOpen(false)}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-auto transition-opacity duration-300" 
      />

      {/* Spotlight highlight borders based on current spotlightZone */}
      {currentStep.spotlightZone === 'overview' && (
        <div className="absolute top-16 left-2 w-84 h-[calc(100vh-130px)] rounded-3xl border-2 border-cyan-400 shadow-[0_0_50px_rgba(6,182,212,0.5)] pointer-events-none transition-all duration-500 animate-pulse" />
      )}
      {currentStep.spotlightZone === 'crew' && (
        <div className="absolute top-16 right-2 w-84 h-[calc(100vh-130px)] rounded-3xl border-2 border-cyan-400 shadow-[0_0_50px_rgba(6,182,212,0.5)] pointer-events-none transition-all duration-500 animate-pulse" />
      )}
      {currentStep.spotlightZone === 'mayor' && (
        <div className="absolute bottom-3 left-3 w-[460px] h-72 rounded-3xl border-2 border-cyan-400 shadow-[0_0_50px_rgba(6,182,212,0.5)] pointer-events-none transition-all duration-500 animate-pulse" />
      )}
      {currentStep.spotlightZone === 'timeline' && (
        <div className="absolute bottom-3 right-86 w-[420px] h-72 rounded-3xl border-2 border-cyan-400 shadow-[0_0_50px_rgba(6,182,212,0.5)] pointer-events-none transition-all duration-500 animate-pulse" />
      )}
      {currentStep.spotlightZone === 'switcher' && (
        <div className="absolute top-2 right-2 w-80 h-14 rounded-2xl border-2 border-cyan-400 shadow-[0_0_50px_rgba(6,182,212,0.5)] pointer-events-none transition-all duration-500 animate-pulse" />
      )}

      {/* Main Tour Presentation HUD Box */}
      <div className="pointer-events-auto relative mx-auto w-full max-w-2xl bg-[#0a0f1d]/95 backdrop-blur-xl border border-cyan-400/50 rounded-3xl shadow-[0_0_60px_rgba(6,182,212,0.35)] overflow-hidden transition-all duration-300">
        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-slate-900">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 transition-all duration-500 ease-out"
            style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* Content Area */}
        <div className="p-6">
          {/* Header Row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-cyan-950/80 border border-cyan-400/50 text-cyan-300 text-[11px] font-mono font-bold tracking-wider">
                {currentStep.badge}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                INTERACTIVE DEMO TOUR
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPlayingAuto(!isPlayingAuto)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                  isPlayingAuto
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title={isPlayingAuto ? 'Pause Auto-Play' : 'Auto-Play Walkthrough'}
              >
                {isPlayingAuto ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span>{isPlayingAuto ? 'Auto-Playing' : 'Auto-Play'}</span>
              </button>

              <button
                onClick={() => setIsDemoTourOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Close Tour (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Title & Subtitle */}
          <h2 className="text-xl font-extrabold text-white tracking-wide mb-1">
            {currentStep.title}
          </h2>
          <p className="text-sm font-semibold text-cyan-400 mb-3">
            {currentStep.subtitle}
          </p>

          {/* Narrative Body */}
          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            {currentStep.description}
          </p>

          {/* Key Presenter Talking Points */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 mb-5">
            <div className="text-[10px] font-mono uppercase text-slate-400 tracking-wider mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Key Presenter Takeaways</span>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
              {currentStep.talkingPoints.map((point, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold mt-0.5">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Controls Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
            {/* Step Dots */}
            <div className="flex items-center gap-1.5">
              {steps.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentStepIndex(idx)}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentStepIndex
                      ? 'w-6 bg-cyan-400'
                      : idx < currentStepIndex
                      ? 'w-2 bg-slate-600'
                      : 'w-2 bg-slate-800'
                  }`}
                  title={`Go to step ${idx + 1}`}
                />
              ))}
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={currentStepIndex === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-xs font-semibold transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-xs shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <span>{currentStepIndex === steps.length - 1 ? 'Finish Tour' : 'Next Step'}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}