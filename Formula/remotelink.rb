class Remotelink < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.6.2"
  conflicts_with "remotelink-go", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.2/remotelink-v0.6.2-darwin-arm64", using: :nounzip
      sha256 "ac4ab301989b5718ebb5eb69cb830b75f2dd04d244da43a68e25eb08973748db"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.2/remotelink-v0.6.2-darwin-amd64", using: :nounzip
      sha256 "49e3ac5a348f2871aa26a473d787e59f2aabf773af335771fc2c46d0d4f53e29"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.2/remotelink-v0.6.2-linux-arm64", using: :nounzip
      sha256 "14eea9e756a50b0e32298157cbb8bac6b9a73adc99ad93c582a66def279948fb"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.2/remotelink-v0.6.2-linux-amd64", using: :nounzip
      sha256 "6db407510ea65766d99dbd76d3613c0d0bd58ff5c9cdfd8ef89bb2981c025e47"
    end
  end

  def install
    bin.install Dir["remotelink-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.6.2", shell_output("#{bin}/remotelink --version").strip
  end
end
