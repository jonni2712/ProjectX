/// A saved ProjectX server the app can connect to.
class ServerProfile {
  final String id;
  final String name;
  final String url;

  const ServerProfile({
    required this.id,
    required this.name,
    required this.url,
  });

  ServerProfile copyWith({String? name, String? url}) => ServerProfile(
        id: id,
        name: name ?? this.name,
        url: url ?? this.url,
      );

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'url': url};

  factory ServerProfile.fromJson(Map<String, dynamic> json) => ServerProfile(
        id: json['id'] as String,
        name: (json['name'] as String?)?.trim().isNotEmpty == true
            ? json['name'] as String
            : 'Server',
        url: json['url'] as String,
      );
}
