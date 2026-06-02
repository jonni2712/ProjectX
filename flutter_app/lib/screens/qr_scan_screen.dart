import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../config/theme.dart';

/// Full-screen camera QR scanner. Pops with the decoded string (rawValue) of
/// the first barcode detected, or null if the user backs out.
class QrScanScreen extends StatefulWidget {
  const QrScanScreen({super.key});

  @override
  State<QrScanScreen> createState() => _QrScanScreenState();
}

class _QrScanScreenState extends State<QrScanScreen> {
  final MobileScannerController _controller = MobileScannerController();
  bool _handled = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    final barcodes = capture.barcodes;
    if (barcodes.isEmpty) return;
    final value = barcodes.first.rawValue;
    if (value == null || value.isEmpty) return;
    _handled = true;
    Navigator.of(context).pop(value);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan server QR'),
        actions: [
          IconButton(
            icon: const Icon(Icons.flash_on),
            tooltip: 'Toggle torch',
            onPressed: () => _controller.toggleTorch(),
          ),
          IconButton(
            icon: const Icon(Icons.cameraswitch),
            tooltip: 'Switch camera',
            onPressed: () => _controller.switchCamera(),
          ),
        ],
      ),
      body: Stack(
        alignment: Alignment.center,
        children: [
          MobileScanner(controller: _controller, onDetect: _onDetect),
          // Dim the area outside the scan window for focus.
          Container(color: AppColors.canvas.withValues(alpha: 0.45)),
          // Scan window frame.
          Container(
            width: 240,
            height: 240,
            decoration: BoxDecoration(
              color: Colors.transparent,
              border: Border.all(color: AppColors.accent, width: 2),
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          Positioned(
            bottom: 48,
            left: 24,
            right: 24,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: AppColors.surface.withValues(alpha: 0.9),
                border: Border.all(color: AppColors.border),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Text(
                'Point the camera at the QR code shown by the ProjectX desktop app',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textMuted, height: 1.4),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
