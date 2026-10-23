class RemotelinkGo < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.6.3"
  conflicts_with "remotelink", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-darwin-arm64", using: :nounzip
      sha256 "c1becffeffd1feca642abe90fb17a5064997539c98bac881ab81085b3c3e6596"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-darwin-amd64", using: :nounzip
      sha256 "bb65004f952abe5af2b31ada6ce00365b0dcc47f728376d139976616697e1e52"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-linux-arm64", using: :nounzip
      sha256 "7cbeb659ce46fa3c12797a2fe36c9fb5648c09270c2c5423df52b49099399f17"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-linux-amd64", using: :nounzip
      sha256 "8eb12e4503423be8eb69725afb85c83b375e371ccf7ae485cb3ae4efa7038adc"
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
