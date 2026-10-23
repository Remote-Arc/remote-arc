class Remotelink < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.6.3"
  conflicts_with "remotelink-go", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-darwin-arm64", using: :nounzip
      sha256 "4dacd90978c3d97b4553118998c57508e28c14dd0b34f52aa82e3efcab13085d"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-darwin-amd64", using: :nounzip
      sha256 "13ac9a482f07b26d83e4fecb6f272e5ff434fcdb41d00d7e32bd979448513345"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-linux-arm64", using: :nounzip
      sha256 "f951a8acef82cf1aaa87e6afa4adc0c4ebc1bfb2fbb8f98c79a68b689d3c7203"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-linux-amd64", using: :nounzip
      sha256 "956f3d57cae9588b2de3848c326aecb5daee24aa5bbf49df738231ce39f04b6d"
    end
  end

  def install
    bin.install Dir["remotelink-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.6.3", shell_output("#{bin}/remotelink --version").strip
  end
end
