class RemotelinkGo < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.6.6"
  conflicts_with "remotelink", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.6/remotelink-v0.6.6-darwin-arm64", using: :nounzip
      sha256 "c39f74a672221901411337b14006902739cd9e8a341a4c136ab46d6593628ad1"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.6/remotelink-v0.6.6-darwin-amd64", using: :nounzip
      sha256 "ca8878dfae45ebf21b9283a0c7221c7ec709009be35e13c00cf3f0ee2904dd34"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.6/remotelink-v0.6.6-linux-arm64", using: :nounzip
      sha256 "da3ad45ebae1ed8a0f03e08f6c1605449b5ad84467f1ebbb033f74cf4b26c0b7"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.6/remotelink-v0.6.6-linux-amd64", using: :nounzip
      sha256 "43229dc2c6b78387e00674bf193ff3ff6cbce5d973d47441a4436436cd7bfbcd"
    end
  end

  def install
    bin.install Dir["remotelink-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.6.6", shell_output("#{bin}/remotelink --version").strip
  end
end
