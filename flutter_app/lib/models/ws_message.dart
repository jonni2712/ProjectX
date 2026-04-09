import 'dart:convert';

class WsMessage {
  final String channel;
  final String type;
  final dynamic data;
  final Map<String, dynamic>? meta;

  WsMessage({
    required this.channel,
    required this.type,
    this.data,
    this.meta,
  });

  factory WsMessage.fromJson(String jsonStr) {
    final map = jsonDecode(jsonStr) as Map<String, dynamic>;
    return WsMessage(
      channel: map['channel'] as String,
      type: map['type'] as String,
      data: map['data'],
      meta: map['meta'] as Map<String, dynamic>?,
    );
  }

  String toJson() {
    return jsonEncode({
      'channel': channel,
      'type': type,
      if (data != null) 'data': data,
      if (meta != null) 'meta': meta,
    });
  }
}
