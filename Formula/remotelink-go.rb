class RemotelinkGo < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.8.0"
  conflicts_with "remotelink", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.8.0/remotelink-v0.8.0-darwin-arm64", using: :nounzip
      sha256 "9e4e8022626c1a75225adeba72c129c9c49e1bf35b57f8f8b9bdc65fbf37e014"
    end
    on_intel do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.8.0/remotelink-v0.8.0-darwin-amd64", using: :nounzip
      sha256 "23fbcc06179ff89e966c052bfbb4f3e4fdcd98817b8d6dcb6fdcb51bdbac6dc2"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.8.0/remotelink-v0.8.0-linux-arm64", using: :nounzip
      sha256 "c21197f0a576dbf42e4743f150354acc04a0ee6a97004ef5d860c56726ab8c60"
    end
    on_intel do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.8.0/remotelink-v0.8.0-linux-amd64", using: :nounzip
      sha256 "65cd7e86ffda20f28eb62d7a47664c8b0e85c1d1ceae4f7d1121b3f5fe43b1c8"
    end
  end

  def install
    bin.install Dir["remotelink-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.8.0", shell_output("#{bin}/remotelink --version").strip
  end
end
