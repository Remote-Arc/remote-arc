class RemotelinkGo < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.7.1"
  conflicts_with "remotelink", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.1/remotelink-v0.7.1-darwin-arm64", using: :nounzip
      sha256 "496086d3196723154b50bb6c71e3e86e5e0e954a4d19a253650c80675dc995e0"
    end
    on_intel do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.1/remotelink-v0.7.1-darwin-amd64", using: :nounzip
      sha256 "24e6d34c68ea537653cc0f9b1350af0be0d328784152ad5c8776544c3a33f6f2"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.1/remotelink-v0.7.1-linux-arm64", using: :nounzip
      sha256 "3affc0d9980f5b333efefc827c015b8afb378c297e9f2ad2094b958f786abe2b"
    end
    on_intel do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.1/remotelink-v0.7.1-linux-amd64", using: :nounzip
      sha256 "304c40ed78b777ca673c8778e27220c389a7ac3ec55aee8a9062b2d3216843bf"
    end
  end

  def install
    bin.install Dir["remotelink-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.7.1", shell_output("#{bin}/remotelink --version").strip
  end
end
