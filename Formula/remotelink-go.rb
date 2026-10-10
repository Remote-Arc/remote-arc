class RemotelinkGo < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.6.1"
  conflicts_with "remotelink", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.1/remotelink-v0.6.1-darwin-arm64", using: :nounzip
      sha256 "6d65b40c5e9968565f86676ee01abfcc57699e250a00e6c61679ca85535d62ec"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.1/remotelink-v0.6.1-darwin-amd64", using: :nounzip
      sha256 "43c5be3900b635b95790e3384cbe726aeae1a786e2a6512c7bded7b9da1ccfcf"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.1/remotelink-v0.6.1-linux-arm64", using: :nounzip
      sha256 "1435affd46fade94a4d7adc2489a53eb265e8519d4f72dd0787abb0c0cca353b"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.1/remotelink-v0.6.1-linux-amd64", using: :nounzip
      sha256 "2a03fa9d7d5ea753c7a632e984f23441f58bafd5366d9bdbc177b39a76a753b4"
    end
  end

  def install
    bin.install Dir["remotelink-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.6.1", shell_output("#{bin}/remotelink --version").strip
  end
end
