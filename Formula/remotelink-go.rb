class RemotelinkGo < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.6.3"
  conflicts_with "remotelink", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-darwin-arm64", using: :nounzip
      sha256 "e85b11d454b67a2c9ae8929d707cc80f52a5e627c4feaaf18496e0a24ba2e39e"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-darwin-amd64", using: :nounzip
      sha256 "7d7ced551e202a06ffdfae7d029f105418ba9a9b983b87662a1cb63ab2447de9"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-linux-arm64", using: :nounzip
      sha256 "c3fdeb47328d76f7145c28d52fe270a19df2b3f08655f474bfcaa9a9bea6c5c3"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-linux-amd64", using: :nounzip
      sha256 "bd1c22a357b1b3f67f361678b58f9fd18f11349bc9a6aa18ba5b37d15d06adda"
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
