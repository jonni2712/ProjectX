import React, { useState } from 'react';
import { FolderOpen, User, Globe, Check, ArrowRight, ArrowLeft } from 'lucide-react';

const steps = ['Workspace', 'Admin Account', 'Tunnel', 'Complete'];

export default function SetupWizard() {
  const [step, setStep] = useState(0);

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6C9EFF] to-[#4ECDC4] flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold text-white">P</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome to ProjectX</h1>
          <p className="text-sm text-gray-400 mt-2">Let's set up your remote development server</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                i <= step ? 'bg-[#6C9EFF] text-white' : 'bg-[#1A1A2E] text-gray-500'
              }`}>
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-12 h-0.5 ${i < step ? 'bg-[#6C9EFF]' : 'bg-[#1A1A2E]'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        <div className="bg-[#1A1A2E] rounded-xl border border-white/5 p-8">
          {step === 0 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <FolderOpen size={24} className="text-[#FFE66D]" />
                <h2 className="text-lg font-semibold text-white">Choose Workspace</h2>
              </div>
              <p className="text-sm text-gray-400 mb-4">Select the root folder where your projects live.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="/path/to/your/projects"
                  className="flex-1 bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-3 text-sm text-white font-mono placeholder-gray-600 focus:border-[#6C9EFF] focus:outline-none"
                />
                <button className="px-4 py-3 bg-[#0F0F1A] border border-white/10 rounded-lg text-sm text-gray-300 hover:bg-white/5">
                  Browse
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <User size={24} className="text-[#6C9EFF]" />
                <h2 className="text-lg font-semibold text-white">Create Admin Account</h2>
              </div>
              <p className="text-sm text-gray-400 mb-4">This account will be used to log in from the mobile app.</p>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Username"
                  className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-[#6C9EFF] focus:outline-none"
                />
                <input
                  type="password"
                  placeholder="Password"
                  className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-[#6C9EFF] focus:outline-none"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <Globe size={24} className="text-[#4ECDC4]" />
                <h2 className="text-lg font-semibold text-white">Cloudflare Tunnel (Optional)</h2>
              </div>
              <p className="text-sm text-gray-400 mb-4">Set up a tunnel to access your server from anywhere. You can skip this and configure it later.</p>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Domain (e.g. dev.yourdomain.com)"
                  className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-[#6C9EFF] focus:outline-none"
                />
                <input
                  type="password"
                  placeholder="Cloudflare API Token"
                  className="w-full bg-[#0F0F1A] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-[#6C9EFF] focus:outline-none"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
                <Check size={32} className="text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">All Set!</h2>
              <p className="text-sm text-gray-400">Your server is ready. Install the ProjectX app on your phone and scan the QR code to connect.</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                step === 0 ? 'invisible' : 'text-gray-400 hover:bg-white/5'
              }`}
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <button
              onClick={() => setStep(Math.min(steps.length - 1, step + 1))}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#6C9EFF] text-white rounded-lg text-sm font-medium hover:bg-[#5A8BE6] transition-colors"
            >
              {step === steps.length - 1 ? 'Go to Dashboard' : 'Continue'}
              {step < steps.length - 1 && <ArrowRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
