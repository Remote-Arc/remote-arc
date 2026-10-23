class Remotelink < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.6.3"
  conflicts_with "remotelink-go", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-darwin-arm64", using: :nounzip
      sha256 "f4cc90010b269844a73b2a8780c8571a400d320b8647c789b6b8dde5d040a894"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-darwin-amd64", using: :nounzip
      sha256 "aa56084ca44b71f6ec07465788be22395012aa58477e5e0d2b372577a50eda52"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-linux-arm64", using: :nounzip
      sha256 "b06c4db9cd3ef2254195c796d4f3ab6dbaa42851ba589586210f0405979272ad"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-linux-amd64", using: :nounzip
      sha256 "880b8037189f5b6a80b505030b9b4cf2d788c86370b6c09c2a3bd00c60f0fc97"
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
