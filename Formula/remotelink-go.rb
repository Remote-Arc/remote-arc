class RemotelinkGo < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.6.2"
  conflicts_with "remotelink", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.2/remotelink-v0.6.2-darwin-arm64", using: :nounzip
      sha256 "344288bbe1112887e344fa98061913b0e2c8f968ae9b2fc5f6f62fa7d3d9e964"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.2/remotelink-v0.6.2-darwin-amd64", using: :nounzip
      sha256 "ef189a660bad523aec5513be7c341758699a1e401c6488e941c525c631500515"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.2/remotelink-v0.6.2-linux-arm64", using: :nounzip
      sha256 "a9170731d78612dc7b0208665469943a1fc85a9088c68aec4b9320b0ad10fb69"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.2/remotelink-v0.6.2-linux-amd64", using: :nounzip
      sha256 "71db6a81030a2e3169ab3ea8ad0acb0ce296c9eb0b82b84e616c92c6b6318344"
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
